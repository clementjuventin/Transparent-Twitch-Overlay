const {
    app,
    BrowserWindow,
    ipcMain,
    screen
} = require('electron')

const path = require('path')
const tmi = require('tmi.js');
const fs = require('fs')
const axios = require('axios')

require('dotenv').config()

var chatWindow;
var UIWindow;
var ignoreMouseEvent = true
function createChatWindow(width, height, windowWidth) {
    chatWindow = new BrowserWindow({
        skipTaskbar: true,
        transparent: true,
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: false,
            icon: __dirname + '/assets/icon.ico'
        }
    })
    chatWindow.setBounds({
        x: width - windowWidth,
        y: 0,
        width: windowWidth,
        height: height
    })
    //chatWindow.webContents.openDevTools()
    chatWindow.loadFile('./html/index.html')
    chatWindow.removeMenu()
    chatWindow.setIgnoreMouseEvents(ignoreMouseEvent)
    chatWindow.setAlwaysOnTop(true, 'screen');
}

function createUIWindow(width, height, windowWidth) {
    UIWindow = new BrowserWindow({
        skipTaskbar: true,
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: false,
            icon: __dirname + '/assets/icon.ico',
        }
    })
    UIWindow.setBounds({
        x: width - windowWidth,
        y: height - 100,
        width: windowWidth,
        height: 100
    })
    //UIWindow.webContents.openDevTools()
    UIWindow.loadFile('./html/ui.html')
    UIWindow.removeMenu()
    UIWindow.setAlwaysOnTop(true, 'screen');
}

function createWindow() {
    const {
        width,
        height
    } = screen.getPrimaryDisplay().workAreaSize
    const windowWidth = parseInt(process.env.windowWidth)
    let windowHeight = process.env.windowHeight;
    if(windowHeight==="full")
        windowHeight = height
    else
        windowHeight = parseInt(windowHeight)
    createChatWindow(width, windowHeight, windowWidth)
    createUIWindow(width, height, windowWidth)
}

app.whenReady().then(() => {
    createWindow()
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

ipcMain.on('init', (event) => {
    if(
        process.env.R==undefined
        || process.env.G==undefined
        || process.env.B==undefined
        || process.env.rainbow==undefined
        ){
        console.log("Error in your .env file. Check the github to see the template.")
        process.exit(1)
    }

    startListening(event)
    const data = {
        RGB:{
            R:parseInt(process.env.R),
            G:parseInt(process.env.G),
            B:parseInt(process.env.B)
        },
        rainbow:(process.env.rainbow=='true')
    }    
    event.reply('init', data)
})
ipcMain.on('initUI', (eventUI)=>{
    async function load(){
        const streamData = await getStreamData()
        eventUI.reply('titleUpdate', streamData===null?'error':streamData.data[0].title)
        eventUI.reply('viewUpdate', streamData===null?0:streamData.data[0].viewer_count)
    }
    async function updateViewerCount(){
        const streamData = await getStreamData()
        eventUI.reply('viewUpdate', streamData===null?0:streamData.data[0].viewer_count)
    }
    load()
    setInterval(()=>{
        updateViewerCount()
    }, process.env.streamDataUpdate*1000)
})

async function startListening(event) {
    // Define configuration options
    const opts = {
        identity: {
            username: process.env.BOT_USERNAME,
            password: process.env.OAUTH_TOKEN
        },
        channels: [
            process.env.CHANNEL_NAME
        ]
    };

    // Create a client with our options
    const client = new tmi.client(opts);

    // Register our event handlers (defined below)
    client.on('message', onMessageHandler);
    client.on('connected', onConnectedHandler);

    // Connect to Twitch:
    client.connect();

    //Listeners
    ipcMain.on('changeWindowSelection', (e, value) => {
        ignoreMouseEvent=!ignoreMouseEvent
        chatWindow.setIgnoreMouseEvents(ignoreMouseEvent)
        chatWindow.setAlwaysOnTop(true, 'screen');
        UIWindow.setAlwaysOnTop(true, 'screen');
    })
    ipcMain.on('opacityChange', (e, value) => {
        event.reply('opacityChange', value)
    })
    ipcMain.on('message', (e, value) => {
        client.say(process.env.CHANNEL_NAME, value);
        event.reply('message', {
            msg: value,
            author: process.env.CHANNEL_NAME
        })
    })
    ipcMain.on('quit', (e) =>{
        app.quit()
    })

    // Called every time a message comes in
    function onMessageHandler(target, context, msg, self) {

        if (context["message-type"] != 'chat') return;

        if (self) {
            return;
        } // Ignore messages from the bot
        event.reply('message', {
            msg: msg,
            author: context["display-name"]
        })
    }
    // Called every time the bot connects to Twitch chat
    function onConnectedHandler(addr, port) {
        event.reply('message', {
            msg: `* Connected to ${addr}:${port}`,
            author: "Logs"
        })
        console.log(`* Connected to ${addr}:${port}`);
    }
}

async function getStreamData() {
    var streamData
    await axios.post(
            'https://id.twitch.tv/oauth2/token?client_id=' + process.env.CLIENT_ID + '&client_secret=' + process.env.CLIENT_SECRET + '&grant_type=client_credentials&scope=channel_read')
        .then(response => {
            oauthToken = response.data.access_token;
        })
    await axios.get(`https://api.twitch.tv/helix/streams?user_login=${process.env.CHANNEL_NAME}`, {
        headers: {
            'Client-Id': process.env.CLIENT_ID,
            'Authorization': `Bearer ${oauthToken}`
        },
    }).then(result => {
        streamData = result.data
    }).catch(error => {
        console.log(error)
        streamData = null
    });

    return streamData;
}