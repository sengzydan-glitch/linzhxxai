# JACCKSALLAS AI — v1.0

A responsive dark-green AI chat website powered by the OpenAI Responses API and deployed on Vercel.

## Features

- Text chat with recent conversation context
- Browser-local chat history (localStorage)
- Coding assistant mode
- Image upload and image understanding (JPG, PNG, WebP)
- Responsive layout for Android and desktop
- Copy assistant responses and code blocks
- OpenAI API key stays on the server in Vercel Environment Variables

## Project structure

```text
jaccksallas-ai/
├── index.html
├── styles.css
├── app.js
├── package.json
├── vercel.json
├── .gitignore
├── .env.example
└── api/
    └── chat.js
```

## Deploy using GitHub + Vercel (Android-friendly)

1. Extract `jaccksallas-ai.zip` on your phone.
2. Open GitHub in your browser and sign in.
3. Create a new repository named `jaccksallas-ai`. For a private personal project, choose **Private**.
4. In the repository, use **Add file → Upload files**.
5. Upload the contents of the extracted project folder. Make sure `index.html`, `app.js`, `styles.css`, `package.json`, `vercel.json`, `.gitignore`, `.env.example`, and the `api` folder with `chat.js` are at the repository root.
6. Commit the uploaded files.
7. Open Vercel and sign in using GitHub.
8. Choose **Add New → Project**, then import `jaccksallas-ai`.
9. In project configuration, add Environment Variables:
   - `OPENAI_API_KEY` = your secret OpenAI API key
   - `OPENAI_MODEL` = `gpt-4.1-mini` (or another vision-capable model available to your API account)
10. Apply the variables to Production and Preview if needed, then deploy.
11. Open the generated `https://your-project.vercel.app` address and test a text prompt and a small image.

## Important: API key safety

- Never paste the real API key into `index.html`, `app.js`, GitHub, chat messages, or screenshots.
- Never commit a real `.env` file.
- Only the Vercel Function in `api/chat.js` reads `process.env.OPENAI_API_KEY`.
- If a key is accidentally exposed, revoke it and create a replacement in the OpenAI Platform.
- Anyone who can access the public website can send requests to its chat endpoint. API usage may incur charges. Before sharing widely, add authentication and server-side rate limiting/usage controls, and monitor API usage.
- Vercel hosting and OpenAI API usage are separate services. Free hosting does not mean free AI API calls. Check the current pricing and limits for both services.

## Image upload

The browser resizes images to JPEG (maximum 1600 px on the longest side) before sending them. The backend accepts JPG, PNG, or WebP data URLs and checks the payload size. Image understanding depends on the selected model supporting image input.

## Chat history

Chat history is saved in the current browser's localStorage. It is not synced between devices or browsers. Image files are not persisted in local history to keep browser storage small; after a reload, the text conversation remains but previously attached images are not re-sent.

## Local development (optional)

Install Node.js and Vercel CLI, then run:

```bash
npm install -g vercel
vercel dev
```

Add a local `.env` file with your own test values only if you are developing locally. Keep `.env` out of Git.

## Troubleshooting

- **OPENAI_API_KEY not configured:** add the variable in Vercel Project Settings → Environment Variables, then redeploy.
- **401 / invalid API key:** check that the key is active and copied correctly. Do not share it.
- **Model not found / not available:** set `OPENAI_MODEL` to a model available to your OpenAI API project that supports image input, then redeploy.
- **Insufficient quota / billing error:** check the API project's usage and billing status. ChatGPT subscription and API billing are separate.
- **Function not found:** ensure `api/chat.js` is inside the project root's `api` directory.
- **Image request too large:** choose a smaller image.

## Current scope

This is a starter application, not a complete clone of ChatGPT. It does not include user accounts, cloud-synced history, streaming tokens, file search, or persistent database storage.
