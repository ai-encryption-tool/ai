# Extension Testing

## Load unpacked

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select `browser_extension/`.
5. Pin AI Memory Vault to the toolbar.

## Backend

Run:

```powershell
cd backend
$env:EMBEDDING_MODE="hash"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## ChatGPT test

1. Open `https://chatgpt.com`.
2. Type a prompt but do not send it.
3. Open the extension.
4. Click `Use Vault Context`.
5. Verify approved memories are inserted above the prompt.
6. Confirm the message is not sent automatically.

## Claude test

1. Open `https://claude.ai`.
2. Type a prompt but do not send it.
3. Open the extension.
4. Click `Find relevant memory for current prompt`.
5. Select memories.
6. Click `Insert context`.

## Save current chat

1. Open a supported AI conversation.
2. Open the extension.
3. Click `Preview current chat`.
4. Review the preview.
5. Edit the chat name if needed.
6. Click `Save chat` to store the whole visible conversation as one encrypted memory.
6. Or click `Generate memory suggestions`.
7. Edit/reject/save each suggestion.

Saved chat memories are useful when you want continuity for a specific conversation. They can be renamed in the extension, and they can be long, so review what is inserted before sending.

## Known selector limitations

ChatGPT, Claude, Gemini, and Copilot can change DOM structures without notice. The content script uses specific selectors first and fallbacks second:

- `textarea`
- `[contenteditable="true"]`
- `[role="textbox"]`

If insertion does not work, copy the generated context manually from the extension popup.
