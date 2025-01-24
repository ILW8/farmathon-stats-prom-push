import WebSocketManager from './js/socket.js';
// import ReconnectingWebSocket from './js/reconnecting-websocket.min.js'


const cache = {};
const baseUrl = window.location.origin + window.location.pathname;
const basePath = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

let host = "127.0.0.1:24050" || window.location.host;
const socket = new WebSocketManager(host);



function on_open() {
    try {
        console.log('[] started');
        socket.sendCommand('getSettings', encodeURI(window.COUNTER_PATH));

    } catch (error) {
        console.log(error);
    }

    setInterval(updateSubs, 498);
    setInterval(updateTimeRemaining, 497);

    setInterval(updatePromSubathonMetrics, 999);
}

async function on_commands(data) {
    try {
        const {command, message} = data;
        console.log(`command: ${command}`)
        if (command !== 'getSettings')
            return;

        if (message["promPushGatewayURL"]) {
            cache["promPushGatewayURL"] = message["promPushGatewayURL"]
        }

        if (message['promPushGatewayHeartrateURL']) {
            cache['promPushGatewayHeartrateURL'] = message['promPushGatewayHeartrateURL'];
        }

        if (message['pulsoidAPIToken']) {
            // create pulsoid websocket here:
            // url: wss://dev.pulsoid.net/api/v1/data/real_time?access_token=<TOKEN_HERE>&response_mode=text_plain_only_heart_rates
        }


    } catch (error) {
        console.log(error);
    }
}

socket.createConnection(`/websocket/commands`, on_commands, undefined, on_open);

let subs = null;
let timerSeconds = null;

async function updateSubs() {
    const timerStr = await (await fetch(`${basePath}/subathon_evolved/clock.txt`)).text();
    const [hours, minutes, seconds] = timerStr.split(':').map(Number);
    timerSeconds = hours * 3600 + minutes * 60 + seconds;
}

async function updateTimeRemaining() {
    subs = await (await fetch(`${basePath}/subathon_evolved/subscriptions.txt`)).text();
}

async function updatePromSubathonMetrics() {
    if (!cache["promPushGatewayURL"])
        return;

    let output = '';
    output += '# HELP farmathon_timer_remaining_seconds Time left in the farmathon timer\n';
    output += '# TYPE farmathon_timer_remaining_seconds gauge\n';
    output += `farmathon_timer_remaining_seconds ${timerSeconds}\n`;
    output += '\n';
    output += '# HELP farmathon_accumulated_subs Subs gained during farmathon\n';
    output += '# TYPE farmathon_accumulated_subs gauge\n';
    output += `farmathon_accumulated_subs ${subs}\n`;

    fetch(cache["promPushGatewayURL"], {
        method: 'PUT',
        // mode: 'no-cors',
        headers: {
            'Content-Type': 'text/plain',
        },
        body: output,
    }).then((resp) => {
        if (!resp.ok)
            console.error(`failed to push metrics: ${resp.status} ${resp.statusText}`)
    }).catch((err) => {
        console.error(`error pushing metrics: ${err}`)
    })
}

async function updatePromHeartrateMetric(heartrate) {
        if (!cache["promPushGatewayHeartrateURL"])
        return;

    let output = '';
    output += '# HELP heartrate Latest heartrate reading from pulsoid\n';
    output += '# TYPE heartrate gauge\n';
    output += `heartrate ${heartrate}\n`;

    fetch(cache["promPushGatewayHeartrateURL"], {
        method: 'PUT',
        // mode: 'no-cors',
        headers: {
            'Content-Type': 'text/plain',
        },
        body: output,
    }).then((resp) => {
        if (!resp.ok)
            console.error(`failed to push metrics: ${resp.status} ${resp.statusText}`)
    }).catch((err) => {
        console.error(`error pushing metrics: ${err}`)
    })
}