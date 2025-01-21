import WebSocketManager from './js/socket.js';


const cache = {};
const url = new URL(`${window.location.origin}${window.location.pathname}${window.location.hash.replace('#', '?')}`);


let host = "127.0.0.1:24050" || window.location.host;
const socket = new WebSocketManager(host);


const commands_text = document.createElement('div');
commands_text.id = 'commands_text';
commands_text.classList.add('commands');


const authorization = document.createElement('div');
authorization.id = 'authorization';
authorization.classList.add('authorization');
authorization.innerHTML = 'Pending';

const modal = document.createElement('div');
modal.id = 'modal';
modal.classList.add('modal');


document.body.appendChild(commands_text);
document.body.appendChild(authorization);
document.body.appendChild(modal);


function on_open() {
    try {
        console.log('[] started');
        socket.sendCommand('getSettings', encodeURI(window.COUNTER_PATH));

    } catch (error) {
        console.log(error);
    }

    setInterval(updatePromFile, 1000);
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
    } catch (error) {
        console.log(error);
    }
}

socket.createConnection(`/websocket/commands`, on_commands, undefined, on_open);

async function updatePromFile() {
    if (!cache["promPushGatewayURL"])
        return;

    const baseUrl = window.location.origin + window.location.pathname;
    const basePath = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const timerStr = await (await fetch(`${basePath}/subathon_evolved/clock.txt`)).text();
    const subs = await (await fetch(`${basePath}/subathon_evolved/subscriptions.txt`)).text();
    const [hours, minutes, seconds] = timerStr.split(':').map(Number);
    const timerSeconds = hours * 3600 + minutes * 60 + seconds;
    console.log(`timer is ${timerStr} (${timerSeconds}s), subs is ${subs}`);

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
        if (resp.ok)
            console.log('Metrics pushed OK')
        else
            console.error(`failed to push metrics: ${resp.status} ${resp.statusText}`)
    }).catch((err) => {
        console.error(`error pushing metrics: ${err}`)
    })
}