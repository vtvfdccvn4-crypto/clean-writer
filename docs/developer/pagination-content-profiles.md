# Pagination content profiles

The pagination profiler supports content classification with:

```powershell
node scripts/profile-pagination.mjs --content-profile --content-pages 50,260 --samples 1 --output reports/content-classification.json
```

The current fixtures cover:

- plain text;
- headings;
- tables;
- images;
- mixed content.

At 260 pages, mixed content required 1.57 seconds and 6.02 ms per page. Tables required 1.21 seconds and 4.65 ms per page. Plain text, headings, and images remained below 3.4 ms per page.

The mixed fixture also showed the largest heap growth, so the next profiling pass should isolate table layout and mixed-content memory retention before changing general pagination scheduling.
