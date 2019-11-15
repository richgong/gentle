export function hashCode(s) {
    var hash = 0;
    if (s.length == 0) {
        return hash;
    }
    for (var i = 0; i < s.length; i++) {
        var char = s.charCodeAt(i);
        hash = ((hash<<5)-hash)+char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
}

let _seed = 0

export function _seededRandom() {
    _seed = (_seed * 9301 + 49297) % 233280;
    return _seed / 233280;
}

export function random(min, max) {
    min = (typeof min !== "undefined") ? min : 0;
    max = (typeof max !== "undefined") ? max : 1;
    return min + _seededRandom() * (max - min);
}

export function clamp(v, min, max) {
    return v <= min ? min : v >= max ? max : v;
}

export function flatten(tensors) {
    const size = tensors[0].length;
    const result = new Float32Array(tensors.length * size);
    tensors.forEach((arr, i) => result.set(arr, i * size));
    return result;
}


// Copied from "Piano.jsx / Utils.js"
export class LoopList {
    constructor(size) {
        this.items = []
        this.items.length = size
        this.cur = 0
        this.c = 0
    }

    clear() {
        this.c = 0
    }

    ready()
    {
        return this.c >= this.items.length
    }

    push(item) {
        if (++this.cur >= this.items.length)
            this.cur = 0;
        let old = this.items[this.cur]
        this.items[this.cur] = item
        if (this.c < this.items.length) {
            old = null
            ++this.c
        }
        return old
    }

    back(i)
    {
        i = this.cur - i
        return this.items[i >= 0 ? i : this.items.length + i]
    }
}
