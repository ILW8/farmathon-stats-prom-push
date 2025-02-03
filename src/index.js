import WebSocketManager from './js/socket.js';
// import ReconnectingWebSocket from './js/reconnecting-websocket.min.js'
import {
    S3Client,
    PutObjectCommand
} from '@aws-sdk/client-s3';


const cache = {};
let host = "127.0.0.1:24050" || window.location.host;
let subs = null;
let timerSeconds = null;

const socket = new WebSocketManager(host);

/** @property {Object?} [obsstudio] */
if (window.obsstudio) {
    socket.createConnection(`/websocket/commands`, on_commands, undefined, on_open);
} else {
    const modal = document.createElement('div');

    modal.id = 'modal';
    modal.classList.add('modal');
    modal.classList.add('-red');
    modal.innerHTML = `Socket not created, load this page in OBS.`;

    document.body.append(modal);
}

async function upload_file_s3(key, content) {
    const s3_access_key = cache["S3AccessKey"];
    const s3_secret_key = cache["S3SecretKey"];
    const s3_endpoint = cache["S3Endpoint"];
    const bucket_name = cache["S3Bucket"];

    if (!s3_access_key || !s3_secret_key || !s3_endpoint || !bucket_name) {
        console.warn("missing s3 configuration");
        return false;
    }

    const config = {
        credentials: { accessKeyId: s3_access_key, secretAccessKey: s3_secret_key },
        endpoint: s3_endpoint,
        region: 'us-east-1'
    };

    // noinspection JSCheckFunctionSignatures
    const client = new S3Client(config);
    const command = new PutObjectCommand({
        "Body": JSON.stringify(content),
        "Bucket": bucket_name,
        "Key": key
    });
    try {
        // noinspection TypeScriptValidateTypes
        await client.send(command);
    } catch (err) {
        console.error(`failed uploading object: ${err}`);
        return false;
    }

    return true;
}


function on_open() {
    try {
        console.log('[] started');
        socket.sendCommand('getSettings', encodeURI(window.COUNTER_PATH));

    } catch (error) {
        console.error(error);
    }

    setInterval(updateSubs, 498);
    setInterval(updateTimeRemaining, 497);

    setInterval(updatePromSubathonMetrics, 999);
    setInterval(() => {
        upload_file_s3('timer.txt', timerSeconds).then((res) => {
            console.log(`uploaded timer with value: ${timerSeconds} (${res ? 'ok' : 'failed'})`);
        });
    }, 1500);
}

async function on_commands(data) {
    try {
        const {command, message} = data;
        // console.log(`command: ${command}, msg=${JSON.stringify(message)}`);
        if (command !== 'getSettings')
            return;

        for (const key in message)
            cache[key] = message[key];

        console.log(JSON.stringify(cache));


    } catch (error) {
        console.error(error);
    }
}

async function updateSubs() {
    const timerStr = await (await fetch(`/subathon_evolved/clock.txt`)).text();
    const [hours, minutes, seconds] = timerStr.split(':').map(Number);
    timerSeconds = hours * 3600 + minutes * 60 + seconds;
}

async function updateTimeRemaining() {
    subs = await (await fetch(`/subathon_evolved/subscriptions.txt`)).text();
}

async function updatePromSubathonMetrics() {
    if (!cache["promPushGatewayURL"])
    {
        console.warn("missing prometheus push gateway url");
        return;
    }

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
