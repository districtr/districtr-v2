"""Deterministic submission moderation.

A submission is flagged when its text contains any blocklisted phrase
(whole-word match after normalize()). blocklist.sha256 holds the phrases'
digests, not the phrases, so the words stay out of the repo. No network
calls, no model: the same text always gets the same verdict.

Only portal submissions are moderated. A flag sets `nsfw`, which the frontend
renders blurred with an opt-in reveal; nothing is withheld. Portal admins may
flip `nsfw` both ways and hard-hide spam via the admin endpoints (the CMS
Portals hub) — there is no approval gate.
"""

import hashlib
import re
import sys
from pathlib import Path

from sqlmodel import Session, col, select, update

# Longest blocklisted phrase, in words. Longer phrases can't match; the
# __main__ helper refuses them.
MAX_PHRASE_WORDS = 6


def normalize(text: str) -> list[str]:
    """Lowercase and split on every run of non-alphanumerics."""
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).split()


def digest(words: list[str]) -> str:
    return hashlib.sha256(" ".join(words).encode()).hexdigest()


BLOCKLIST: frozenset[str] = frozenset(
    line
    for line in (Path(__file__).parent / "blocklist.sha256").read_text().splitlines()
    if line and not line.startswith("#")
)


def find_blocked_phrase(text: str) -> str | None:
    """The first run of 1..MAX_PHRASE_WORDS words (normalized, space-joined)
    whose digest is in the blocklist, or None when the text is clean."""
    words = normalize(text or "")
    for i in range(len(words)):
        for n in range(1, MAX_PHRASE_WORDS + 1):
            phrase = words[i : i + n]
            if len(phrase) == n and digest(phrase) in BLOCKLIST:
                return " ".join(phrase)
    return None


def moderate_submission(submission_id: int, session: Session) -> None:
    """Check a submission's content and map card text; persist the matched
    phrase (moderation_match, shown to portal admins so a false positive can be
    traced to its blocklist entry) and nsfw.

    Checks the concatenation of every content value and the attached map's
    metadata name/description. The gallery card renders the map's
    name/description, so leaving them unchecked would let an abusive map title
    sail past the nsfw filter under a clean one-word comment. The outcome is
    one blur bit plus the phrase, so per-field granularity buys nothing.

    Runs inside the caller's transaction and does not commit: the check is
    in-process and sub-millisecond, so the entry is never visible unchecked.
    """
    # Local import: models imports nothing from here, but keeping the module
    # import-light avoids cycles with app.models consumers.
    from app.models import Document
    from app.submissions.fields import PRIVATE_FIELDS
    from app.submissions.models import Submission, SubmissionContent

    submission = session.get(Submission, submission_id)
    if submission is None:
        return
    values = session.scalars(
        select(SubmissionContent.value).where(
            col(SubmissionContent.submission_id) == submission_id,
            # Private answers (email) never leave the backend, and aren't
            # shown publicly, so they have nothing to be checked for.
            col(SubmissionContent.field).not_in(PRIVATE_FIELDS),
        )
    ).all()
    map_texts: list[str] = []
    if submission.map_public_id is not None:
        metadata = session.scalars(
            select(Document.map_metadata).where(
                col(Document.public_id) == submission.map_public_id
            )
        ).first()
        if metadata:
            map_texts = [
                str(metadata.get(key) or "") for key in ("name", "description")
            ]
    match = find_blocked_phrase(" ".join([*values, *map_texts]))
    session.execute(
        update(Submission)
        .where(col(Submission.id) == submission_id)
        .values(moderation_match=match, nsfw=match is not None)
    )


if __name__ == "__main__":
    # Print the blocklist line for a phrase (and whether it's already listed).
    words = normalize(" ".join(sys.argv[1:]))
    if not words or len(words) > MAX_PHRASE_WORDS:
        sys.exit(f"usage: phrase of 1..{MAX_PHRASE_WORDS} words")
    print(digest(words), "(listed)" if digest(words) in BLOCKLIST else "(not listed)")
