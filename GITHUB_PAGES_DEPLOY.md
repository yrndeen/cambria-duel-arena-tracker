# GitHub Pages Deployment Guide

This guide will help you deploy the Cambria Duel Arena Tracker to GitHub Pages.

## Prerequisites

- A GitHub account
- Git installed on your local machine
- Node.js installed (optional, for local testing)

## Step 1: Create a GitHub Repository

1. Go to [GitHub](https://github.com) and sign in
2. Click the "+" icon in the top right corner
3. Select "New repository"
4. Name your repository (e.g., `cambria-duel-tracker`)
5. Make sure it's set to **Public** (required for free GitHub Pages)
6. Don't initialize with README, .gitignore, or license (we already have these)
7. Click "Create repository"

## Step 2: Upload Your Code

### Option A: Using Git Command Line

1. **Initialize Git** (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. **Add GitHub as remote**:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY_NAME.git
   ```

3. **Push to GitHub**:
   ```bash
   git branch -M main
   git push -u origin main
   ```

### Option B: Using GitHub Desktop

1. Download and install [GitHub Desktop](https://desktop.github.com/)
2. Open GitHub Desktop
3. Click "Clone a repository from the Internet"
4. Enter your repository URL
5. Choose a local path
6. Click "Clone"
7. Copy your project files to the cloned folder
8. In GitHub Desktop, add all files and commit with message "Initial commit"
9. Click "Push origin" to upload to GitHub

### Option C: Using GitHub Web Interface

1. Go to your repository on GitHub
2. Click "uploading an existing file"
3. Drag and drop all your project files
4. Add commit message "Initial commit"
5. Click "Commit changes"

## Step 3: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click on "Settings" tab
3. Scroll down to "Pages" section in the left sidebar
4. Under "Source", select "Deploy from a branch"
5. Select "main" branch
6. Select "/ (root)" folder
7. Click "Save"

## Step 4: Configure GitHub Actions (Automatic Deployment)

The repository includes a GitHub Actions workflow that will automatically deploy your site when you push changes.

1. The workflow file is already created at `.github/workflows/deploy.yml`
2. It will automatically run when you push to the main branch
3. You can see the deployment status in the "Actions" tab of your repository

## Step 5: Access Your Site

1. After enabling GitHub Pages, wait 5-10 minutes for the first deployment
2. Your site will be available at: `https://YOUR_USERNAME.github.io/YOUR_REPOSITORY_NAME`
3. For example: `https://johndoe.github.io/cambria-duel-tracker`

## Step 6: Custom Domain (Optional)

If you have a custom domain:

1. Go to your repository Settings > Pages
2. Under "Custom domain", enter your domain
3. Add a `CNAME` file to your repository root with your domain name
4. Update the GitHub Actions workflow to include your domain in the `cname` field

## Local Testing

Before deploying, you can test your site locally:

```bash
# Install dependencies
npm install

# Build the site
npm run build

# Serve the built files
npx serve dist
```

## Updating Your Site

To update your site:

1. Make changes to your files
2. Commit and push to GitHub:
   ```bash
   git add .
   git commit -m "Update site"
   git push origin main
   ```
3. GitHub Actions will automatically deploy the changes
4. Your site will be updated within a few minutes

## Troubleshooting

### Site Not Loading
- Check that your repository is public
- Verify GitHub Pages is enabled in Settings
- Check the Actions tab for any deployment errors
- Wait 10-15 minutes for the first deployment

### Styling Issues
- Make sure all CSS files are included
- Check that file paths are correct
- Verify that the `.nojekyll` file is present

### JavaScript Not Working
- Check browser console for errors
- Verify that all JS files are included
- Make sure external CDN links are accessible

## Support

If you encounter issues:
1. Check the GitHub Actions logs in the "Actions" tab
2. Verify all files are uploaded correctly
3. Check the GitHub Pages documentation
4. Create an issue in your repository

## Security Note

Since this is a public repository, be careful not to include:
- API keys or secrets
- Personal information
- Sensitive configuration data

The current setup only includes public blockchain data and doesn't require any sensitive information.

---

**Your Cambria Duel Arena Tracker is now live on GitHub Pages! 🎉**