const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const WhatsAppManager = require('../whatsapp/manager');

let mainWindow;
let whatsappManager;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: 'SuperParty WhatsApp Manager'
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  whatsappManager = new WhatsAppManager();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('add-account', async (event, accountName) => {
  return await whatsappManager.addAccount(accountName);
});

ipcMain.handle('remove-account', async (event, accountId) => {
  return await whatsappManager.removeAccount(accountId);
});

ipcMain.handle('get-accounts', async () => {
  return whatsappManager.getAccounts();
});

ipcMain.handle('get-chats', async (event, accountId) => {
  return await whatsappManager.getChats(accountId);
});

ipcMain.handle('get-messages', async (event, accountId, chatId) => {
  return await whatsappManager.getMessages(accountId, chatId);
});

ipcMain.handle('send-message', async (event, accountId, chatId, message) => {
  return await whatsappManager.sendMessage(accountId, chatId, message);
});
