# Local notes (Water page, #notes)

The Local notes section on water.html holds the owner's own first hand notes, one folded card per lake.
It ships with two dashed "Sample note, replace with your own" slots per lake. They are templates, not intel.

To add a real note, edit water.html between `<!-- local-notes -->` and `<!-- /local-notes -->`:

1. Find the lake's block (`data-for="hoover"`, `"alum"` or `"buckeye"`).
2. Replace a sample `<li class="note-slot">` with:

   ```html
   <li class="note-slot note-real">
     <p class="note-slot-label">Oct. 2026</p>
     <p class="note-slot-body">Spot, when, what you saw.</p>
   </li>
   ```

3. Update the count in the summary (`2 sample slots` becomes `3 notes`, for example).
4. Run tools/stamp-version.py, bump VERSION in sw.js, commit.

Rules: date every note, keep it to what you saw yourself, and never add stocking numbers, depths or regulations here.
Those belong in the sourced sections above it.
