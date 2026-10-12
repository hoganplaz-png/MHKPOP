# MHKPOP shop website

Information website for MH KPOP SELL (@mh.kpop.sell). Customers read the price list and place orders **only through the order form**.
You change prices and stock in a **Google Sheet**, with no coding. Shop details are in one plain text file.

## How you change things

| I want to change... | Where | Needs code? |
|---|---|---|
| Add, remove or reprice an album, change a tag, mark **sold out** | Your Google Sheet | No |
| Opening hours, address, headline, delivery text | `settings.js` (edit the text between the quote marks on github.com) | No, only text |
| Album photos | Upload to the `images` folder, then write the file name in the sheet's 圖片 column | No |

After you save, the Sheet updates the site within a few minutes. A change to `settings.js` shows after about a minute.

## Setup (once, about 20 minutes)

### 1. Put the site online (free)
1. On github.com open this repository, then **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, pick this branch and **/ (root)**, then **Save**.
3. After about a minute your site is at `https://<your-github-name>.github.io/MH/`. Put this link in your Instagram bio.

Prefer another host? Download this repository as a ZIP and drag the unzipped folder onto https://app.netlify.com/drop. That also works.

### 2. Make your product sheet
1. In Google Sheets choose **File → Import → Upload**, pick `products-template.csv`, then **Replace spreadsheet**.
2. Keep the first row exactly as it is. The columns are:
   - **組合**: group, such as TXT
   - **名稱**: album name
   - **價錢**: number only, such as 109
   - **標籤**: small label, such as 期間限定 (optional)
   - **圖片**: photo file name in the `images` folder, such as `cortis-pb.jpg`, or a full web link (optional)
   - **狀態**: leave empty if available. Write **售罄** for sold out, or **只限門市** for in-store only.
3. Choose **File → Share → Publish to web**. Pick the sheet tab, change "Web page" to **Comma-separated values (.csv)**, click **Publish**, and copy the link.
4. On github.com open `settings.js`, click the pencil icon, and paste the link between the quote marks of `sheetCsvUrl: ""`. Click **Commit changes**.

Anyone with the link can read a published sheet. Do not put private information in it.

### 3. Switch on the order form (orders arrive in your email)
1. Make a free account at https://formspree.io and create a new form. Use your own email address.
2. Copy the form link, which looks like `https://formspree.io/f/abcdwxyz`.
3. Paste it between the quote marks of `formEndpoint: ""` in `settings.js` and commit.
4. Place a test order on your site and check that the email arrives. Formspree asks you to confirm your email address first.

Until this step is done, the form stays switched off and customers are asked to message you on Instagram, so no order can get lost.

## Daily use
- **Item sold out:** type 售罄 in the 狀態 column. It is greyed out and cannot be ordered.
- **New album:** add a row. **New price:** change the number. **Remove an album:** delete the row.
- **A row is ignored** if it has no group, no name or a price that is not a number.
- If the sheet cannot be read, the site shows the sample list stored in `settings.js`.

## Files
- `index.html`, `styles.css`, `script.js`: the page (you don't need to touch these)
- `settings.js`: shop details and the two links above
- `products-template.csv`: the starting product list for your Google Sheet
- `assets/`: logo files. `images/`: album photos.
