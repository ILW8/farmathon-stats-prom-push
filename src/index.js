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
    socket.api_v2(on_apiv2_msg, undefined, undefined);
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

async function on_apiv2_msg(data) {
    if (!cache.osu_is_running) cache.osu_is_running = true;

    try {
        /**
         * state.number
         * - 0: menu
         * - 1: editor (edit)
         * - 2: playing
         * - 3: exit
         * - 4: edit song select (selectEdit)
         * - 5: song select
         * - 7: results screen
         */
        cache['osu_state'] = data.state.number;
        cache['osu_beatmap_id'] = data.beatmap.id;
        cache['osu_beatmapset_id'] = data.beatmap.set;
        cache['osu_mods_bitmask'] = data.play.mods.number;

        cache['osu_pct_complete'] = 0;
        if (cache['osu_state'] === 2 || cache['osu_state'] === 7) {
            const drain_time = data.beatmap.time.lastObject - data.beatmap.time.firstObject;
            const live_drain_time = Math.max(0, data.beatmap.time.live - data.beatmap.time.firstObject);
            cache['osu_pct_complete'] = Math.min(1, live_drain_time / drain_time) * 100;
        }
        console.log(`percent complete: ${cache['osu_pct_complete']}`);

        cache['osu_combo'] = data.play.combo.current;
        cache['osu_accuracy'] = data.play.accuracy;

        switch (data.state.number) {
            case 2:
            case 7:
                cache['fc_pp'] = data.play.pp.fc;
                cache['current_pp'] = data.play.pp.current;
                break;

            case 5:
            default:
                cache['fc_pp'] = data.performance.accuracy['100'];
                cache['current_pp'] = data.play.pp.current;
                break;

            case 3:
                cache.osu_is_running = false;
                cache['fc_pp'] = 0;
                cache['current_pp'] = 0;
        }

    } catch (error) {
        console.log('api-v2', error);
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
    output += `farmathon_timer_remaining_seconds ${timerSeconds}\n\n`;

    output += '# HELP farmathon_accumulated_subs Subs gained during farmathon\n';
    output += '# TYPE farmathon_accumulated_subs gauge\n';
    output += `farmathon_accumulated_subs ${subs}\n\n`;

    output += '# HELP osu_game_state osu! game state\n';
    output += '# TYPE osu_game_state gauge\n';
    output += `osu_game_state ${cache.osu_state ?? 3}\n\n`;

    output += '# HELP osu_current_pp Current pp value (in-game or results screen)\n';
    output += '# TYPE osu_current_pp gauge\n';
    output += `osu_current_pp ${cache.current_pp ?? 0}\n\n`;

    output += '# HELP osu_fc_pp Attainable pp if FC at current accuracy (or SS if in song select)\n';
    output += '# TYPE osu_fc_pp gauge\n';
    output += `osu_fc_pp ${cache.fc_pp ?? 0}\n`;

    output += '# HELP osu_beatmap_id Current beatmap ID\n';
    output += '# TYPE osu_beatmap_id gauge\n';
    output += `osu_beatmap_id ${cache.osu_beatmap_id ?? 0}\n`;

    output += '# HELP osu_beatmapset_id Current beatmapset ID\n';
    output += '# TYPE osu_beatmapset_id gauge\n';
    output += `osu_beatmapset_id ${cache.osu_beatmapset_id ?? 0}\n`;

    output += '# HELP osu_mods_bitmask Current mods bitmask\n';
    output += '# TYPE osu_mods_bitmask gauge\n';
    output += `osu_mods_bitmask ${cache.osu_mods_bitmask ?? 0}\n`;

    output += '# HELP osu_pct_complete Percentage of beatmap completed\n';
    output += '# TYPE osu_pct_complete gauge\n';
    output += `osu_pct_complete ${cache.osu_pct_complete ?? 0}\n`;

    output += '# HELP osu_combo Current combo\n';
    output += '# TYPE osu_combo gauge\n';
    output += `osu_combo ${cache.osu_combo ?? 0}\n`;

    output += '# HELP osu_accuracy Current accuracy\n';
    output += '# TYPE osu_accuracy gauge\n';
    output += `osu_accuracy ${cache.osu_accuracy ?? 100.0}\n`;

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
