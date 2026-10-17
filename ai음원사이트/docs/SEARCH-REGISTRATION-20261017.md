# Search registration — 2026-10-17

- Google Search Console URL-prefix property: `https://aifect.co.kr/`, verified by HTML meta tag under the user's Google account `lsevenn77@gmail.com`.
- Google sitemap: `https://aifect.co.kr/sitemap.xml`, submitted and processed successfully; 31 pages discovered at registration.
- Naver Search Advisor: `https://aifect.co.kr`, ownership verified under the user's signed-in Naver account. Initial free-service terms were accepted with the user's explicit approval.
- Naver sitemap: `https://aifect.co.kr/sitemap.xml`, submission confirmed in the registered sitemap table at 2026-10-17 17:35:47 KST.
- Keep both `google-site-verification` and `naver-site-verification` meta tags in `dist/index.html` during future changes. These public ownership tags were deployed in production version 150 (source `fb69693bdcb93db8f5f21c48397e1dbbdba4bed5`).
- `/robots.txt` references the sitemap and permits public pages while excluding `/api/` and `/internal/`. The sitemap uses public document routes such as `/music/:id`, not hash-only application URLs.
- Registration and sitemap submission are complete. Search result exposure/indexing is decided separately by each search engine and is not implied by registration success.
