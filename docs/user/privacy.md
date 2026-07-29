# Privacy and Local Data

Clear Writer is a browser-based writing application. It does not require an
account and does not include an application server for project storage.

## Where projects are stored

- Browser projects are stored in the browser's Origin Private File System
  (OPFS) for the site that hosts Clear Writer.
- Local-directory projects are stored in the folder selected by the user, when
  the browser supports the File System Access API and the user grants access.
- Draft-recovery data and recent-workspace references may also be kept in the
  browser for the same site origin.

Clearing that site's browser storage can remove browser-backed projects and
draft recovery data. Export or copy important work to a local directory and
keep independent backups.

## Network use

The application loads its own static HTML, JavaScript, CSS, fonts, icons, and
PWA assets from its hosting origin. It does not upload project text, images, or
settings to a Clear Writer service. Browser print/PDF actions are handled by
the browser and operating system.

## Hosting-provider data

The site host, CDN, or browser may collect standard access or diagnostic data
under their own policies. Deployers should publish the hosting provider's
privacy information alongside this page if it applies to their installation.
