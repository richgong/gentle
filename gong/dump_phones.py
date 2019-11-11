"""
In phonetics and linguistics, a phone is any distinct speech sound or gesture, regardless of whether the exact sound is critical to the meanings of words.

In contrast, a phoneme is a speech sound in a given language that, if swapped with another phoneme, could change one word to another. Phones are absolute and are not specific to any language, but phonemes can be discussed only in reference to specific languages.
"""

import operator
import json
import glob
import os

from gong.utils import TRAIN_PATH
from gong.phonemes_preston_blair import phoneme_conversion, phoneme_set
from collections import defaultdict


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
    return d


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
    gentle_phone_dict = dump_phones()
    print("== Parsing CMU...")
    for phoneme in parse_file('gong/cmudict-0.7b.symbols.txt'):
        if phoneme not in phoneme_conversion:
            print("Phoneme:", phoneme)
    c = 0
    cmu_dict = {}
    for word, phonemes in parse_file('gong/cmudict-0.7b.txt', '  ', ignore=';;;'):
        phoneme_list = phonemes.split(' ')
        cmu_dict[word] = [phoneme_conversion[p] for p in phoneme_list]
    print(c, "phonemes checked")
    d = defaultdict(dict)
    for filepath in glob.glob(f'{TRAIN_PATH}/*/*/*.json'):
        if not os.path.isfile(filepath):
            continue
        # print("==", filepath)
        with open(filepath) as f:
            item = json.loads(f.read())
            for w in item['words']:
                if not w.get('phones'):
                    continue
                word = w['word'].upper()
                phones = [p['phone'] for p in w['phones']]
                if word in cmu_dict:
                    cmu_phones = cmu_dict[word]
                    if len(phones) == len(cmu_phones):
                        print("MATCHED:", word, cmu_phones, phones)
                        for i in range(len(phones)):
                            if cmu_phones[i] in d[phones[i]]:
                                d[phones[i]][cmu_phones[i]] += 1
                            else:
                                d[phones[i]][cmu_phones[i]] = 1
                    else:
                        is_non_silent = False
                        for phone in phones:
                            if phone in gentle_phone_dict:
                                is_non_silent = True
                        if is_non_silent:
                            # print("Mismatched phoneme count", word, cmu_dict[word], phones)
                            pass

    for k in d.keys():
        d[k] = max(d[k].items(), key=operator.itemgetter(1))[0]
    with open('react/gentle_to_prestonblair.json', 'w') as f:
        f.write(json.dumps(d, indent=2))

    d2 = {}
    c = 0
    for phoneme in phoneme_set:
        c += 1
        d2[phoneme] = c
    with open('react/prestonblair_to_output.json', 'w') as f:
        f.write(json.dumps(d2, indent=2))


    #print(len(phoneme_conversion), "total")


if __name__ == '__main__':
    dump_cmu()
