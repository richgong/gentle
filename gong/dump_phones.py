import json

"""
In phonetics and linguistics, a phone is any distinct speech sound or gesture, regardless of whether the exact sound is critical to the meanings of words.

In contrast, a phoneme is a speech sound in a given language that, if swapped with another phoneme, could change one word to another. Phones are absolute and are not specific to any language, but phonemes can be discussed only in reference to specific languages.
"""

if __name__ == '__main__':
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
