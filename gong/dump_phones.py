"""
In phonetics and linguistics, a phone is any distinct speech sound or gesture, regardless of whether the exact sound is critical to the meanings of words.

In contrast, a phoneme is a speech sound in a given language that, if swapped with another phoneme, could change one word to another. Phones are absolute and are not specific to any language, but phonemes can be discussed only in reference to specific languages.
"""

import json

from gong.phonemes import phoneme_conversion, phoneme_set


def dump_phones():
    print("== Parsing non-silence...")
    d = {}
    c = 0
    with open('exp/langdir/phones/nonsilence.txt') as f:
        for line in f.read().split('\n'):
            if not line:
                continue
            c += 1
            d[line] = c
            print("Phone:", line, c)
    with open('react/phones.json', 'w') as f:
        f.write(json.dumps(d, indent=2))


def parse_file(filepath, split_ch=None, ignore=None):
    with open(filepath, encoding="ISO-8859-1") as f:
        for line in f.readlines():
            line = line.strip()
            if not line:
                continue
            if ignore and line.startswith(ignore):
                continue
            if split_ch:
                yield line.split(split_ch)
            else:
                yield line


def dump_cmu():
    print("== Parsing CMU...")
    for phoneme in parse_file('gong/cmudict-0.7b.symbols.txt'):
        if phoneme not in phoneme_conversion:
            print("Phoneme:", phoneme)
    c = 0
    for word, phonemes in parse_file('gong/cmudict-0.7b.txt', '  ', ignore=';;;'):
        phoneme_list = phonemes.split(' ')
        for phoneme in phoneme_list:
            c += 1
            if phoneme not in phoneme_conversion:
                print("Phoneme not found:", phoneme)
    print(c, "phonemes checked")

    #print(len(phoneme_conversion), "total")


if __name__ == '__main__':
    dump_phones()
    dump_cmu()
