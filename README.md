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

## Automatic deploy to Firebase (recommended)

Once this is set up, every change saved to the `main` branch goes live by itself. No terminal is needed after setup.

1. Create a Firebase project at https://console.firebase.google.com, then open **Build → Hosting → Get started** and click through until it finishes.
2. In Firebase go to **Project settings (gear icon) → Service accounts → Generate new private key**. A `.json` file downloads. Keep it private.
3. In this GitHub repository open **Settings → Secrets and variables → Actions → New repository secret**. Name it `FIREBASE_SERVICE_ACCOUNT`, open the `.json` file in a text editor, copy **everything**, and paste it as the value. This is the only secret needed. The project ID is read from the file.
4. Open the **Actions** tab, choose **Deploy to Firebase Hosting**, click **Run workflow**. About a minute later your site is live at `https://<project-id>.web.app`.

Never send the `.json` key to anyone or paste it into a chat. Only paste it into the GitHub secret.

### Firebase Hosting from your own computer (alternative)
1. Make a project at https://console.firebase.google.com (Add project, any name, Google Analytics off is fine).
2. On your computer install Node.js (https://nodejs.org), then open a terminal in this folder and run:
   - `npm install -g firebase-tools`
   - `firebase login`  (sign in with your Google account)
   - `firebase use --add`  (pick your project, give it any alias)
   - `firebase deploy --only hosting`
3. The terminal prints your link, `https://<project-id>.web.app`. Add your own domain later in Firebase console, Hosting, Add custom domain.
4. To update the site after editing `settings.js` or images, run `firebase deploy --only hosting` again. Sheet changes need no deploy.

No computer? Open https://shell.cloud.google.com, upload the website ZIP, unzip it, and run the same `firebase use --add` and `firebase deploy --only hosting` commands there.

### 1. Other free hosts (GitHub Pages, Netlify)
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

### 3. Orders and the admin page (your own database)
Orders are saved in your Firebase project and listed on a password-protected page at `https://<your-site>/admin`.

One-time setup:
1. Put the admin email in `admin-email.txt` (one line, nothing else). Only this email can read orders.
2. In the Firebase console open **Build → Authentication → Get started**, choose **Email/Password**, switch it on and save.
3. Still in Authentication, open **Users → Add user**. Enter the admin email and a password you choose.
4. Deploy (any push to `main`, or Actions → Run workflow). The deploy creates the database, publishes the security rules and connects the website.
5. Place a test order on the site, then sign in at `/admin` to see it.

On the admin page you can search orders, filter by status, change a status (新訂單, 已確認, 已完成, 已取消) and export a CSV file.

Who can do what (`firestore.rules`): anyone can add an order, only the admin email can read or change one, and nobody can delete one.

If the database cannot be created automatically, open **Build → Firestore Database → Create database**, choose a location and **production mode**, then run the deploy again.

Optional: instead of Firebase you can put a Formspree link in `formEndpoint` in `settings.js`.

## Daily use
- **Item sold out:** type 售罄 in the 狀態 column. It is greyed out and cannot be ordered.
- **New album:** add a row. **New price:** change the number. **Remove an album:** delete the row.
- **A row is ignored** if it has no group, no name or a price that is not a number.
- If the sheet cannot be read, the site shows the sample list stored in `settings.js`.

## Files
- `index.html`, `styles.css`, `script.js`: the page (you don't need to touch these)
- `settings.js`: shop details and the product sheet link
- `admin.html`, `admin.js`, `admin.css`: the admin page
- `firestore.rules`, `firebase.json`, `scripts/`, `.github/`: order security rules and the automatic deploy
- `products-template.csv`: the starting product list for your Google Sheet
- `assets/`: logo files. `images/`: album photos.
