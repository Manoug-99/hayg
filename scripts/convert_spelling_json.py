#!/usr/bin/env python3
"""Convert Armenian spelling word lists from JSON to spelling-data.js.

Usage:
    python scripts/convert_spelling_json.py words.json -o js/spelling-data.js

Each JSON group has a key such as "Դ-Թ" and a list for each letter:
    {"Դ-Թ": {"Դ": ["դպրոց", "դիմակ (դեմքի ծածկոց)"], "Թ": []}}

Parenthesized suffixes are emitted as hints. Without --output, JavaScript is
written to stdout.
"""

import argparse
import json
import re
import sys
from pathlib import Path


HINT_SUFFIX = re.compile(r"(.+?)\s*\(([^()]*)\)\s*$")


def convert_data(data):
    if not isinstance(data, dict):
        raise ValueError("The JSON root must be an object of spelling groups.")

    sections = {}
    seen_questions = set()

    for group, buckets in data.items():
        if not isinstance(group, str):
            raise ValueError("Every spelling group name must be a string.")

        letters = group.split("-")
        if len(letters) != 2 or any(len(letter.strip()) != 1 for letter in letters):
            raise ValueError(f"Invalid group {group!r}; expected two letters separated by '-'.")

        first_letter, second_letter = (letter.strip().upper() for letter in letters)
        if first_letter == second_letter:
            raise ValueError(f"Group {group!r} must contain two different letters.")
        if not isinstance(buckets, dict):
            raise ValueError(f"Group {group!r} must contain an object of letter lists.")

        normalized_buckets = {}
        for letter, words in buckets.items():
            if not isinstance(letter, str) or len(letter.strip()) != 1:
                raise ValueError(f"Invalid letter bucket {letter!r} in group {group!r}.")
            normalized_letter = letter.strip().upper()
            if normalized_letter not in (first_letter, second_letter):
                raise ValueError(
                    f"Bucket {letter!r} is not part of group {group!r}."
                )
            if normalized_letter in normalized_buckets:
                raise ValueError(
                    f"Group {group!r} contains duplicate bucket {letter!r}."
                )
            if not isinstance(words, list):
                raise ValueError(
                    f"Bucket {letter!r} in group {group!r} must be a list."
                )
            normalized_buckets[normalized_letter] = words

        if set(normalized_buckets) != {first_letter, second_letter}:
            raise ValueError(
                f"Group {group!r} must include lists for both "
                f"{first_letter!r} and {second_letter!r}."
            )

        category = f"{first_letter} թէ {second_letter}"
        if category in sections:
            raise ValueError(f"Duplicate spelling group for {category!r}.")

        entries = []
        for letter in (first_letter, second_letter):
            seen_bucket_words = set()
            for position, raw_word in enumerate(normalized_buckets[letter], start=1):
                if not isinstance(raw_word, str):
                    raise ValueError(
                        f"Word #{position} in {group!r}/{letter!r} must be a string."
                    )

                source = raw_word.strip()
                if not source:
                    raise ValueError(
                        f"Word #{position} in {group!r}/{letter!r} is empty."
                    )

                hint = None
                hint_match = HINT_SUFFIX.fullmatch(source)
                if hint_match and hint_match.group(2).strip():
                    source = hint_match.group(1).strip()
                    hint = hint_match.group(2).strip()

                word = source.lower()
                if not word:
                    raise ValueError(
                        f"Word #{position} in {group!r}/{letter!r} is empty."
                    )

                letter_indexes = [
                    index
                    for index, character in enumerate(word)
                    if character == letter.lower()
                ]
                if not letter_indexes:
                    raise ValueError(
                        f"Word {raw_word!r} in {group!r}/{letter!r} "
                        f"does not contain {letter!r}."
                    )
                if word in seen_bucket_words:
                    continue
                seen_bucket_words.add(word)

                for word_index in letter_indexes:
                    question_key = (category, word, word_index)
                    if question_key in seen_questions:
                        raise ValueError(
                            f"Duplicate spelling question for {word!r} "
                            f"at index {word_index} in {category!r}."
                        )
                    seen_questions.add(question_key)

                    entry = {"word": word, "index": word_index}
                    if hint:
                        entry["hint"] = hint
                    entries.append(entry)

        sections[category] = entries

    return sections


def main():
    parser = argparse.ArgumentParser(
        description="Convert Armenian spelling-word JSON into spelling-data.js."
    )
    parser.add_argument("input", type=Path, help="Path to the input JSON file")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output JavaScript file (defaults to stdout)",
    )
    args = parser.parse_args()

    try:
        data = json.loads(args.input.read_text(encoding="utf-8-sig"))
        sections = convert_data(data)
    except (OSError, json.JSONDecodeError, ValueError) as error:
        parser.error(str(error))

    javascript = (
        "window.SPELLING_QUESTION_SECTIONS = "
        + json.dumps(sections, ensure_ascii=False, indent=4)
        + ";\n"
    )

    if args.output:
        try:
            args.output.write_text(javascript, encoding="utf-8")
        except OSError as error:
            parser.error(str(error))
    else:
        sys.stdout.buffer.write(javascript.encode("utf-8"))


if __name__ == "__main__":
    main()
