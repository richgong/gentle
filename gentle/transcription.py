import csv
import io
import json

from collections import defaultdict

class Word:

    SUCCESS = 'success'
    NOT_FOUND_IN_AUDIO = 'not-found-in-audio'
    NOT_FOUND_IN_TRANSCRIPT = 'not-found-in-transcript'

    def __init__(self, case=None, startOffset=None, endOffset=None, word=None, alignedWord=None, phones=None, start=None, end=None, duration=None):
        self.case = case
        self.startOffset = startOffset
        self.endOffset = endOffset
        self.word = word
        self.alignedWord = alignedWord
        self.phones = phones
        self.start = start
        self.duration = duration
        self.end = end
        if start is not None:
            if end is None:
                self.end = start + duration
            elif duration is None:
                self.duration = end - start

    def success(self):
        return self.case == Word.SUCCESS

    def not_found_in_audio(self):
        return self.case == Word.NOT_FOUND_IN_AUDIO

    def as_dict(self, without=None):
        return { key:val for key, val in self.__dict__.items() if (val is not None) and (key != without)}

    def __eq__(self, other):
        return self.__dict__ == other.__dict__

    def __ne__(self, other):
        return not self == other

    def __repr__(self):
        return "Word(" + " ".join(sorted([key + "=" + str(val) for key, val in self.as_dict(without="phones").items()])) + ")"

    def shift(self, time=None, offset=None):
        if self.start is not None and time is not None:
            self.start += time
            self.end += time

        if self.startOffset is not None and offset is not None:
            self.startOffset += offset
            self.endOffset += offset

        return self # for easy chaining

    def swap_alignment(self, other):
        '''Swaps the alignment info of two words, but does not swap the offset'''
        self.case, other.case = other.case, self.case
        self.alignedWord, other.alignedWord = other.alignedWord, self.alignedWord
        self.phones, other.phones = other.phones, self.phones
        self.start, other.start = other.start, self.start
        self.end, other.end = other.end, self.end
        self.duration, other.duration = other.duration, self.duration

    def corresponds(self, other):
        '''Returns true if self and other refer to the same word, at the same position in the audio (within a small tolerance)'''
        if self.word != other.word: return False
        return abs(self.start - other.start) / (self.duration + other.duration) < 0.1

class Transcription:

    def __init__(self, transcript=None, words=None):
        self.transcript = transcript
        self.words = words

    def __eq__(self, other):
        return self.transcript == other.transcript and self.words == other.words

    def to_json(self, **kwargs):
        '''Return a JSON representation of the aligned transcript'''
        options = {
                'sort_keys':    True,
                'indent':       4,
                'separators':   (',', ': '),
                }
        options.update(kwargs)

        container = {}
        if self.transcript:
            container['transcript'] = self.transcript
        if self.words: 
            container['words'] = [word.as_dict(without="duration") for word in self.words]
        return json.dumps(container, **options)

    def to_dict(self):
        container = {}
        if self.transcript:
            container['transcript'] = self.transcript
        if self.words:
            container['words'] = [word.as_dict(without="duration") for word in self.words]
        return container

    @classmethod
    def from_json(cls, json_str):
        return cls._from_jsondata(json.loads(json_str))

    @classmethod
    def from_jsonfile(cls, filename):
        with open(filename) as fh:
            return cls._from_jsondata(json.load(fh))

    @classmethod
    def _from_jsondata(cls, data):
        return cls(transcript = data['transcript'], words = [Word(**wd) for wd in data['words']])

    def to_csv(self):
        '''Return a CSV representation of the aligned transcript. Format:
        <word> <token> <start seconds> <end seconds>
        '''
        if not self.words:
            return ''
        buf = io.StringIO()
        w = csv.writer(buf)
        for X in self.words:
            if X.case not in (Word.SUCCESS, Word.NOT_FOUND_IN_AUDIO):
                continue
            row = [X.word,
                X.alignedWord,
                X.start,
                X.end
            ]
            w.writerow(row)
        return buf.getvalue()

    def stats(self):
        counts = defaultdict(int)
        for word in self.words:
            counts[word.case] += 1
        stats = {}
        stats['total'] = len(self.words)
        for key, val in counts.items():
            stats[key] = val
        return stats

Transcription.Word = Word
