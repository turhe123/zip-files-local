# Create ZIP File Online — specification

**Tagline:** Pick or drop files and folders and build a ZIP right in your browser, with a compression level and no upload.

**Category:** Data & Files

**Free alternative to:** ezyZip Create Zip (ad-ridden page, file count and size limits, some sites upload your files to build the archive, nag screens to buy a pro plan)

**Search phrases:** create zip file online, zip files online, compress files to zip, make zip on chromebook, zip folder online, combine files into zip

**Allowed libraries:** fflate

**Published at:** https://turhe123.github.io/zip-files-local/

## Acceptance checks (each must have a test)

- dropping three sample files lists them with their sizes
- pressing Create ZIP downloads an archive named archive.zip larger than 1 KB
- removing one file from the list excludes it from the result
- dropping a folder keeps its relative paths inside the archive
- the result shows the total before and after size
- works at 390px wide

## Spec

Search demand: zip files online, create zip file and zip folder online appear whenever someone is on a school Chromebook, a phone or a borrowed computer and must send several files as one attachment. The usual sites are full of ads, cap the count or size of files, and several upload everything to build the archive. Others only offer a trial before asking for a paid plan. Users sending tax forms or ID scans would rather not upload them.

Our version does one job: bundle chosen files and folders into one ZIP archive locally. Features: drag and drop files or whole folders (using the directory entry API where supported), a Choose files button and a Choose folder button, a list with sizes and per file remove buttons, an archive name field defaulting to archive, a compression level choice of Store, Fast and Best with Fast as default, an option to skip hidden system files such as ds store, and a password-free guarantee note. After building, show original total, archive size and percent saved. Optionally offer to split nothing it is one archive only to stay focused.

UI: a big drop zone with two buttons above the fold. Below it, a file list with name, relative path, size and a remove button, and a running total. A sticky Create ZIP button shows progress as a bar while compressing, then a Download link appears with the final name, for example archive.zip. Empty state has a short privacy line. Error state covers a file that cannot be read and a total size over the safe limit. Keyboard: the zone is a labelled file input, the list items have delete buttons in tab order, and Enter on the archive name field starts creation.

Technical approach: collect File objects through input elements and the drag drop DataTransfer items, walking directory entries recursively to keep relative paths. Compress with the allowed fflate library using its asynchronous zip in a Web Worker so the interface stays responsive, with per entry levels that skip recompression for already compressed types such as jpg, png, mp4, zip and pdf, which store faster. Set the modified time of each entry from the file last modified value. Convert the resulting bytes to a Blob with the zip MIME type and offer a download through an object URL that is revoked afterwards. Stream progress using the callback per file and compute the total from the sizes.

Edge cases: total sizes above about 500 MB on mobile warn about memory since everything lives in RAM duplicate names get numbered suffixes inside the archive names with Unicode are written with the UTF-8 flag file paths are normalised to forward slashes empty files are allowed zero files disables the button files that fail to read are skipped with a notice listing them Safari may not support folder drop, in which case the folder button uses the webkitdirectory attribute.

Demo data: three bundled sample files from a fictional school project called Solar Oven Report, a text outline, a CSV of temperature readings and a small PNG chart, plus a subfolder with a notes file.
