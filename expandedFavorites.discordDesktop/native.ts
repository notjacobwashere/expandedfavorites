/* SPDX-License-Identifier: GPL-3.0-or-later */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { app } from "electron";

import { AccountOrder, empty, Favorites, Gif, observe, OverflowGif } from "./model";

type Row =
    | { accountId: string; type: "order"; account: Favorites["account"]; sequence: number; }
    | { accountId: string; type: "gif"; gif: OverflowGif; };

type Change =
    | { type: "save"; current: AccountOrder[]; gif: Gif; }
    | { type: "remove"; url: string; }
    | { type: "observe"; current: AccountOrder[]; };

function storagePath() {
    if (process.platform !== "win32") throw new Error("ExpandedFavorites requires Windows.");
    return join(app.getPath("documents"), "expandedfavorites");
}

let queue: Promise<unknown> = Promise.resolve();

function serialized<T>(accountId: string, operation: (path: string, rows: Row[]) => Promise<T>) {
    const pending = queue.then(async () => {
        if (!/^\d{17,20}$/.test(accountId)) throw new Error("Invalid Discord account.");
        const path = join(storagePath(), "favorites.txt");
        const content = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return "";
            throw error;
        });
        const rows = content.split(/\r?\n/).filter(line => line.trim()).map(line => {
            const row = JSON.parse(line) as Row;
            if (row.type === "gif" && row.gif?.url && row.gif?.src) return row;
            if (row.type === "order" && Array.isArray(row.account) && Number.isSafeInteger(row.sequence)) return row;
            throw new Error("Invalid favorites.txt record.");
        });
        return operation(path, rows);
    });
    queue = pending.catch(() => {});
    return pending;
}

function readAccount(rows: Row[], id: string): Favorites {
    const local: OverflowGif[] = [];
    let account = empty.account;
    let sequence = 0;
    for (const row of rows) {
        if (row.accountId !== id) continue;
        if (row.type === "gif") {
            local.push(row.gif);
            sequence = Math.max(sequence, row.gif.sequence);
        } else {
            account = row.account;
            sequence = Math.max(sequence, row.sequence);
        }
    }
    return { local, account, sequence };
}

export function load(_: unknown, id: string) {
    return serialized(id, async (_path, rows) => readAccount(rows, id));
}

export function change(_: unknown, id: string, request: Change) {
    return serialized(id, async (path, rows) => {
        const before = readAccount(rows, id);
        let next = before;
        switch (request.type) {
            case "save": {
                if (before.local.some(gif => gif.url === request.gif.url)) return before;
                const { url, src, width, height, format, order } = request.gif;
                if (![url, src].every(value => /^https?:\/\//i.test(value))
                    || ![width, height, format, order].every(Number.isFinite)) {
                    throw new Error("Unsupported GIF metadata.");
                }
                const observed = observe(before, request.current);
                const sequence = observed.sequence + 1;
                next = { ...observed, sequence, local: [...observed.local, { url, src, width, height, format, order, sequence }] };
                break;
            }
            case "remove":
                if (!before.local.some(gif => gif.url === request.url)) return before;
                next = { ...before, local: before.local.filter(gif => gif.url !== request.url) };
                break;
            case "observe":
                if (before.local.length) next = observe(before, request.current);
                break;
        }
        if (next === before) return before;

        const updated = rows.filter(row => row.accountId !== id);
        if (next.local.length) {
            updated.push({ accountId: id, type: "order", account: next.account, sequence: next.sequence });
            for (const gif of next.local) updated.push({ accountId: id, type: "gif", gif });
        }
        await mkdir(storagePath(), { recursive: true });
        const temporary = path + "." + randomUUID() + ".tmp";
        try {
            const content = updated.map(row => JSON.stringify(row) + "\n").join("");
            await writeFile(temporary, content, { encoding: "utf8", flag: "wx", flush: true });
            await rename(temporary, path);
        } finally {
            await unlink(temporary).catch(() => {});
        }
        return next.local.length ? next : empty;
    });
}
