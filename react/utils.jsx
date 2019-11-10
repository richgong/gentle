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
