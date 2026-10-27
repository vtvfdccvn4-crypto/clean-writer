# Manual acceptance pass

Do this yourself, by hand, in desktop Chromium (Chrome or Edge), with a fresh
browser profile or a project name you have not used. It takes about 20 minutes.
`npm run test:acceptance` covers the same ground with a script, but a script
does not see what a person sees (layout, wording, timing, the real print dialog).
Tick each line, and write down anything that surprised you.

Start: `npm run dev`, open the printed address.

## 1. Create
- [ ] Create a project in browser storage (no local-folder choice appears).
- [ ] Create two sections. The project name and sections show in the explorer.

## 2. Edit
- [ ] Type a few paragraphs in section 1. The status reads "Unsaved changes",
      then "Saved" shortly after you stop.
- [ ] Add a heading, a list, and an image if you have one. The preview matches.
- [ ] Toggle a page break before section 2 and reorder the sections.

## 3. Reload
- [ ] Reload the tab. The project reopens (or is in the recent list) with the
      same text, order and page break.

## 4. Crash recovery
- [ ] Type without pausing for several seconds, then kill the tab abruptly
      (close the browser's task from its task manager, or kill the process).
- [ ] Reopen the app and the section. "Unsaved Draft Found" appears; restore it.
      The text is back and the status ends at "Saved". Reload: no second prompt.
- [ ] Note how much typing, if any, was lost. It should be about a second.

## 5. PDF export
- [ ] Open the paginated preview and export a PDF through the print dialog
      ("Save as PDF"). Open the PDF: text, page breaks and numbering are right.

## 6. Trash restore
- [ ] Delete a section. Open Trash, restore it. It returns in its place with
      its text and page-break setting.
- [ ] Delete another, then Delete forever. Confirm it asks first.

## 7. Backup export
- [ ] Click Download backup. A ZIP downloads and a notice names it.
- [ ] Open the ZIP in your system's archive tool: it has `clear-writer-backup.json`,
      `settings.json`, and `sections/*.md` files you can read.

## 8. Backup import
- [ ] Open project > Import a backup, choose that ZIP. A new project named
      "... (imported)" opens.
- [ ] Compare it with the original: same section text, order, page breaks,
      numbering, images, page setup. Export its PDF; it matches the first.
- [ ] The original project is unchanged.
- [ ] Turn on a page break for a section that starts with plain text (no
      heading) in the original, print the merged preview, and check the imported
      project prints the same pages.
- [ ] Try importing a file that is not a backup (rename a text file to .zip).
      An error is shown and no project is added to the list.

Finally, clear nothing and close the browser; reopen it a day later and check
the projects are still there. If anything fails, note the step and what you saw.
