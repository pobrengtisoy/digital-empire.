# Homepage image provenance

Each shipped `.webp` here is a compressed copy of a PNG master in `.impeccable/build/masters/`.
The masters carry their exact generation prompt or origin embedded in the file
(read with `.claude/skills/impeccable/scripts/impeccable embed-prompt <file> --read`).
`.impeccable/build/provenance.sh` re-embeds them after any edit.

All tarp and print-head images were generated with Runway from the user-approved
homepage mock-up (Runway task 45492061-85f2-41b0-b307-24e44e938871).
`wall.png` is a mirror-tiled patch of that mock-up's wall ground.
