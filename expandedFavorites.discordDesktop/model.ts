/* SPDX-License-Identifier: GPL-3.0-or-later */

export interface Gif {
    url: string;
    src: string;
    width: number;
    height: number;
    format: number;
    order: number;
}

export interface AccountOrder {
    url: string;
    order: number;
}

export interface OverflowGif extends Gif {
    sequence: number;
}

export interface Favorites {
    local: OverflowGif[];
    account: (AccountOrder & { sequence: number; })[];
    sequence: number;
}

export const empty: Favorites = { local: [], account: [], sequence: 0 };

export function observe(state: Favorites, current: AccountOrder[]): Favorites {
    if (state.account.length === current.length && current.every((gif, index) =>
        gif.url === state.account[index].url && gif.order === state.account[index].order
    )) return state;

    const previous = new Map(state.account.map(gif => [gif.url, gif]));
    let { sequence } = state;
    const account = [...current].reverse().map(gif => {
        const old = previous.get(gif.url);
        return old?.order === gif.order ? old : { ...gif, sequence: ++sequence };
    }).reverse();
    return { ...state, account, sequence };
}

export function mergeFavorites(current: Gif[], state: Favorites): Gif[] {
    if (state.local.length === 0) return current;
    const accountOrder = new Map(observe(state, current).account.map(gif => [gif.url, gif.sequence]));
    return [
        ...current.map(gif => ({ gif, sequence: accountOrder.get(gif.url)! })),
        ...state.local.filter(gif => !accountOrder.has(gif.url)).map(gif => ({ gif, sequence: gif.sequence }))
    ].sort((a, b) => b.sequence - a.sequence).map(({ gif }) => gif);
}
