/* SPDX-License-Identifier: GPL-3.0-or-later */

import { Logger } from "@utils/Logger";
import definePlugin, { PluginNative } from "@utils/types";
import { React, showToast, UserStore, useStateFromStores } from "@webpack/common";

import { AccountOrder, empty, Favorites, Gif, mergeFavorites, observe } from "./model";

const native = navigator.platform === "Win32"
    ? VencordNative.pluginHelpers.ExpandedFavorites as PluginNative<typeof import("./native")>
    : undefined;
const logger = new Logger("ExpandedFavorites");
const cache = new Map<string, Favorites>();
const loading = new Set<string>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

function publish(id: string, state: Favorites) {
    cache.set(id, state);
    listeners.forEach(listener => listener());
}

function report(action: string, error: unknown) {
    logger.error(action, error);
    showToast({ text: `ExpandedFavorites: ${action}`, variant: "critical" });
}

function useAccount() {
    const id = useStateFromStores([UserStore], () => UserStore.getCurrentUser()?.id);
    const state = React.useSyncExternalStore(subscribe, () => cache.get(id ?? "") ?? empty);
    React.useEffect(() => {
        if (!id || !native || cache.has(id) || loading.has(id)) return;
        loading.add(id);
        native.load(id).then(state => {
            if (!cache.has(id)) publish(id, state);
        }).catch(error => report("Couldn't read local GIF favorites.", error)).finally(() => loading.delete(id));
    }, [id]);
    return { id, state };
}

export default definePlugin({
    name: "ExpandedFavorites",
    description: "Saves GIFs to Documents when Discord GIF Favorites is full.",
    authors: [{ name: "notjacobwashere", id: 0n }],
    patches: [
        {
            find: ".GIF_FAVORITED,{total_num_favorited:",
            replacement: {
                match: /((\i)\.gifs\[(\i)\((\i)\.url\)\]=\{\.\.\.\4,src:\i,format:\i,order:\i\+1\},\i\.\i\.toBinary\(\2\)\.length>\d+\)return )(\i\.\i\.show\(\{title:[^{}]+,body:[^{}]+\}\),)!1/,
                replace: "$1$self.saveOverflow($3($4.url),$2.gifs)?!1:($5!1)"
            }
        },
        {
            find: '.sortBy("order").reverse().value(),[',
            replacement: {
                match: /(return )(\i\.useMemo\(\(\)=>\i\(\)\(\i\)\.map\(\(\i,\i\)=>\(\{\.\.\.\i,url:\i,src:\i\?\.\(\i\.src,\i\)\?\?\i\.src\}\)\)\.sortBy\("order"\)\.reverse\(\)\.value\(\),\[\i,(\i)\]\))/,
                replace: "$1$self.useFavorites($2,$3)"
            }
        },
        {
            find: ".FAVORITE_GIF))",
            replacement: [
                {
                    match: /(\i)=((?:\(0,\i\.\i\))\((\(0,\i\.\i\)\(\i\)),\i\))(?=,\i=\1\?)/,
                    replace: "[expandedLocal,$1]=$self.useStar($2,$3)"
                },
                {
                    match: /(?<=\.stopPropagation\(\),\i\(!0\),\i\?)((?:\(0,\i\.\i\))\((\i)\))(?=:\(\(0,\i\.\i\)\(\{url:\2,)/,
                    replace: "(expandedLocal?$self.removeLocal(expandedLocal):$1)"
                }
            ]
        }
    ],

    saveOverflow(url: string, gifs: Record<string, Omit<Gif, "url">>) {
        try {
            const id = UserStore.getCurrentUser()?.id;
            if (!id || !native) return false;
            const { src, width, height, format, order } = gifs[url];
            const current = Object.entries(gifs)
                .filter(([key]) => key !== url)
                .map(([key, gif]) => ({ url: key, order: gif.order }))
                .sort((a, b) => b.order - a.order);
            native.change(id, { type: "save", gif: { url, src, width, height, format, order }, current })
                .then(state => {
                    publish(id, state);
                    showToast({ text: "GIF saved locally." });
                }).catch(error => report("Couldn't save the GIF locally.", error));
            return true;
        } catch (error) {
            logger.error("Couldn't start the overflow save.", error);
            return false;
        }
    },

    useFavorites(current: Gif[], resolveSrc?: (src: string, url: string) => string | undefined) {
        const { id, state } = useAccount();
        React.useEffect(() => {
            if (!id || !native || !state.local.length || observe(state, current) === state) return;
            const order: AccountOrder[] = current.map(({ url, order }) => ({ url, order }));
            native.change(id, { type: "observe", current: order })
                .then(updated => publish(id, updated))
                .catch(error => report("Couldn't save GIF order.", error));
        }, [id, current, state]);
        return React.useMemo(() => {
            try {
                return mergeFavorites(current, state).map(gif => {
                    if (!("sequence" in gif) || !resolveSrc) return gif;
                    return { ...gif, src: resolveSrc(gif.src, gif.url) ?? gif.src };
                });
            } catch (error) {
                logger.error("Couldn't merge GIF favorites.", error);
                return current;
            }
        }, [current, state, resolveSrc]);
    },

    useStar(accountFavorite: boolean, url: string) {
        const { state } = useAccount();
        const local = !accountFavorite && state.local.some(gif => gif.url === url) ? url : undefined;
        return [local, accountFavorite || local != null] as const;
    },

    removeLocal(url: string) {
        try {
            const id = UserStore.getCurrentUser()?.id;
            if (!id || !native) return;
            native.change(id, { type: "remove", url }).then(state => publish(id, state))
                .catch(error => report("Couldn't remove the local GIF.", error));
        } catch (error) {
            report("Couldn't remove the local GIF.", error);
        }
    }
});
