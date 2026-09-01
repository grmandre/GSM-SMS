const mysql = require('mysql');
const serialportgsm = require('serialport-gsm');
const { Client } = require('ssh2');
const net = require('net');


 // Add your second COM port here

let modem1 = serialportgsm.Modem();
const CP1 = 'COM8';
let options = {
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    rtscts: false,
    xon: false,
    xoff: false,
    xany: false,
    autoDeleteOnReceive: true,
    enableConcatenation: true,
    incomingCallIndication: true,
    incomingSMSIndication: true,
    pin: '',
    customInitCommand: '',
    cnmiCommand: 'AT+CNMI=2,1,0,2,1',
    logger: console
};

// Open modem
modem1.open(CP1, options, {}, (err) => {
    if (err) {
        console.error(`Failed to open ${CP1}:`, err.message);
    } else {
        console.log(`${CP1} opened successfully!`);
    }
});

modem1.on('open', () => console.log(`${CP1} is ready`));
modem1.on('close', () => console.log(`${CP1} closed`));
modem1.on('error', (err) => console.error(`${CP1} error:`, err.message));
modem1.on('onSendingMessage', (msg) => console.log(`${CP1} sending:`, msg));
modem1.on('onNewMessageIndicator', (msg) => console.log(`${CP1} new message:`, msg));


// SSH Configuration from .conf file
const sshConfig = {
    host: 'sg1-ss100.a2hosting.com',
    port: 7822,
    username: 'schoolg1',
    password: '9p]4+5BdGQeE8v'
};

// Database configurations
const dbConfig = {
    host: 'localhost', // Connect to localhost through SSH tunnel
    port: 3307,        // Local port for SSH tunnel
    user: 'schoolg1_sgc',
    password: 'wh@kLb~M4lY;x~=x',
    database: 'schoolg1_ams_vcs',
    connectTimeout: 30000,
};

let db;
let mutex = false;
let sshClient;
let localServer;
let localPort = 3307; // Local port for the tunnel

// Function to create SSH tunnel and connect to database
function connectWithSSHTunnel() {
    return new Promise((resolve, reject) => {

        let resolved = false;

        sshClient = new Client();

// Always attach error handler immediately
        sshClient.on('error', (err) => {
            console.error('SSH Client error:', err.code || err.message);
            if (!resolved) reject(err);
            else reconnectWithDelay();
            });


        sshClient.on('ready', () => {
            console.log('SSH Client :: ready');

            resolved = true;

            // Runtime disconnect handlers
            sshClient.on('close', () => {
                console.error('SSH connection closed.');
                reconnectWithDelay();
            });

            // Create local forwarding server
            localServer = net.createServer((localSocket) => {
                console.log('Local connection established');

                sshClient.forwardOut(
                    '127.0.0.1', localPort,
                    'localhost', 3306,
                    (err, sshStream) => {
                        if (err) {
                            console.error('SSH forward error:', err);
                            localSocket.end();
                            return;
                        }

                        console.log('SSH stream established');

                        localSocket.pipe(sshStream).pipe(localSocket);

                        localSocket.on('error', (err) => {
                            console.error('Local socket error:', err);
                        });

                        sshStream.on('error', (err) => {
                            console.error('SSH stream error:', err);
                        });
                    }
                );
            });

            localServer.listen(localPort, '127.0.0.1', () => {
                console.log(`Local server listening on port ${localPort}`);

                db = mysql.createConnection({
                    host: 'localhost',
                    port: localPort,
                    user: dbConfig.user,
                    password: dbConfig.password,
                    database: dbConfig.database,
                    connectTimeout: dbConfig.connectTimeout
                });

                
                db.connect(err => {
                    if (err) {
                        console.error('Database connection error:', err);
                        return reject(err);
                    }

                    console.log('Connected to the database through SSH tunnel!');

                    // 🔹 Handle DB runtime disconnect
                    db.on('error', (err) => {
                        console.error('Database runtime error:', err.code);
                        if (err.fatal) db = null; // nullify immediately so queryDb stops using it
                        reconnectWithDelay();
                    });

                    resolve();
                });
            });

            localServer.on('error', (err) => {
                console.error('Local server error:', err);
                reconnectWithDelay();
            });
        });

        console.log('Connecting to SSH server...');

        sshClient.connect({
            ...sshConfig,
            keepaliveInterval: 10000,
            keepaliveCountMax: 3,
            readyTimeout: 60000
        });

    });
}

// Alternative function using SSH key authentication
function connectWithSSHTunnelKey() {
    return new Promise((resolve, reject) => {
        // Read the SSH private key from .conf file (the key is embedded in the file)
        const privateKey = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAACmFlczI1Ni1jdHIAAAAGYmNyeXB0AAAAGAAAABDDjMZaQT
dodW40GsEoeqJxAAAAEAAAAAEAAAEXAAAAB3NzaC1yc2EAAAADAQABAAABAQCrCoDVgveX
WLC6a6yYuMfHQ2/SOaGWlUoj2jd3ETkoxF7TDsaSCLlodDX2FC99FGmizTzrc3RNsX/u8J
PZijcAkz6q1x6JKg0INEmuGZ2hagNHZitbBs0pGEpp51xo63+vProbPcz4GvOG9wsQ23rJ
oZ0GcTZ4Wri++9yVGkUsMdC+vPgSiRL5OgriqPS+dduEFbclW5Iy0sxuCZUaw4B2bYcgRb
zM/4/s8z0BJ+H9QweWJif3Lw9NOG7kUJgKfGG+P6KveNKDzvdgaYhKIPkEfdkN6/Zee5Oc
hk253y/UZQekrP6baIHNxiMUbDHmPNE9lIOemSWdGKwUG4l0euDxAAADwOFZ4c5LpbnbS+
R9/3No3b75/ZFFTuxwV8zQjNcyPboPwbhzE0ZH4qgvq/jPACjkpCAiXYdngqxpGa5li3wY
L4mt3OvIqIlYDF28RiBu86ylix6FjLhLrHZB6qtAovHJCs2d2yYLhQ0MQA2Eo+Mg0EGHAN
b3+UF1AQmay1v0eMyAotXug4wWVPYPXcVGS5ow44/6YwvpCbQgt+phIFk5rqBSmppWP3If
/YxSrsrjYrMuhBTXM00f/9jT6Pi/MwT1lVpTjpHHHlQnGgclmdMH2p653WQJTmyhRlq03C
DqFa+7iq2AebphLL0+MZDSBuqxeti7kP470zgpiUJ4mtcPmP8CkO53UDZe1Z7PY/LcN7UA
aa9gGBxUDLWDfAjEHKsVuBP10f900ovaBSdRjlIUxHuWLWfkm0WFqQLGh/HaT2BbyNxqnO
sZhM3kHCFFV7IBJ9tCQb6ZFdxdzGwoXs7pVMdKkpTRUVc8W3//ROIOhHwkgaxyn/n2ObGn
GKMhps4zHVQ7uqUYsLc67cZCJxygWyBLwpjP/PbIKMVM3zYsx5cp98y4gnUAdhfdveJ3hl
ifEaMe228UApgT8D70GOK03U8ECcjcSjE3McO4p4zrq31bYjNWp1RdUz7OApxEEZdJ21mw
cYnRZ+HwhBj3LJHf6Lj81GlzKaB18HIo9rW/MiypkaC/ovjqZxws5HH3KnM+nzsg3r5rsH
mpQkwFLadv1KZE23lT+HnpyUGNT88FewgVhj1df+e9M3v82Bli5YDiQlPnmcIg1eiEbw6u
kZ0LbMT7vwI7pjQULTJnSXMSA0Y0xh05MbLQPr8JbmHRzdNHnhvVXGzzDBGJGpy88JEGoK
DzMZ15Fp64Yz9HicqsuszDztAyGpyrycNhMGnx7zkbt6fpKcL1eme6Ik+HQAF3rb8zNebM
SnEBWfQ4SZTfwbBlRASnmYwqxgQpagtZr/n02S03Z9DDnl69edQf3huUPPkPRO0unMCjjb
/RxtoIA8aho99XmHO0YDsPIHUySnMzVdzGBVXjm+VYFEMCMksFv+tLRreecZBspLw6WRGi
bKAfVICJNBC61x03Ek2ikhfh0aLhadyWwBUO5s87UQAgy2FnH9cnfTTEPtwYoKLvE0lEZL
nVq8b8KA1ArKo68sf2G85sRomE/Uwf8QKDluKcdFHPAcFOdrx458MzZKZHGY8p/svxiqlo
bpGCpptPCAMWU6eUPQHbY6ohVZyDSZ/FPTj/ccs3dzQfP6gvAj/QDTgKoxO/0hsZB3lqnx
kg7mfaNg==
-----END OPENSSH PRIVATE KEY-----`;

          sshClient = new Client();

          let resolved = false;

          sshClient.on('error', (err) => {
              console.error('SSH Client error (key auth):', err.message);
              if (!resolved) reject(err);
              else reconnectWithDelay();
          });

                     sshClient.on('ready', async () => {
                 console.log('SSH Client :: ready (key auth)');

                 sshClient.on('close', () => {
                     console.error('SSH connection closed (key auth).');
                     reconnectWithDelay();
                 });
             
                 // Close any previous local server before creating a new one
                 if (localServer) {
                     console.log('Closing previous local server...');
                     await new Promise((resolve) => localServer.close(resolve));
                     localServer = null;
                 }
             
                 // Create new local server
                 localServer = net.createServer((localSocket) => {
                     console.log('Local connection established (key auth)');
             
                     sshClient.forwardOut(
                         '127.0.0.1', localSocket.localPort,
                         'localhost', 3306,
                         (err, sshStream) => {
                             if (err) {
                                 console.error('SSH forward error:', err);
                                 localSocket.end();
                                 return;
                             }
             
                             localSocket.pipe(sshStream).pipe(localSocket);
             
                             localSocket.on('error', (err) => console.error('Local socket error:', err));
                             sshStream.on('error', (err) => console.error('SSH stream error:', err));
                         }
                     );
                 });
             
                 // Attempt to listen, but check port availability first
                 try {
                     await waitForPortFree(localPort); // helper function below
                     await new Promise((resolve, reject) => {
                         localServer.listen(localPort, '127.0.0.1', (err) => {
                             if (err) reject(err);
                             else resolve();
                         });
                     });
             
                     console.log(`Local server listening on port ${localPort} (key auth)`);
             
                     // MySQL connection
                     db = mysql.createConnection({
                         host: 'localhost',
                         port: localPort,
                         user: dbConfig.user,
                         password: dbConfig.password,
                         database: dbConfig.database,
                         connectTimeout: dbConfig.connectTimeout
                     });
             
                     db.connect((err) => {
                         if (err) {
                             console.error('Database connection error:', err);
                             reject(err);
                             return;
                         }
                         console.log('Connected to the database through SSH tunnel (key auth)!');
                         db.on('error', (err) => {
                             console.error('Database runtime error:', err.code);
                             if (err.fatal) db = null; // nullify immediately so queryDb stops using it
                             reconnectWithDelay();
                         });
                         resolved = true;
                         resolve();
                     });

                 } catch (err) {
                     console.error('Failed to bind local server:', err);
                     reject(err);
                 }
             });
             
             // Wait for port to be free
             function waitForPortFree(port, retries = 5, delay = 1000) {
                 const net = require('net');
             
                 return new Promise((resolve, reject) => {
                     const tryPort = (attempt = 0) => {
                         const tester = net.createServer()
                             .once('error', (err) => {
                                 if (attempt < retries) {
                                     setTimeout(() => tryPort(attempt + 1), delay);
                                 } else {
                                     reject(new Error(`Port ${port} still in use`));
                                 }
                             })
                             .once('listening', () => {
                                 tester.close(() => resolve());
                             })
                             .listen(port, '127.0.0.1');
                     };
                     tryPort();
                 });
             }
             
                     // Connect using SSH key authentication
                     console.log('Connecting to SSH server with key auth...');
                     sshClient.connect({
                         host: sshConfig.host,
                         port: sshConfig.port,
                         username: sshConfig.username,
                         privateKey: privateKey,
                         passphrase: '' // Add passphrase if the key is encrypted
                     });
                 });
             }
             
             
             function waitForInternet() {
                 return new Promise(resolve => {
             
                     const check = () => {
                         const socket = new net.Socket();
             
                         socket.setTimeout(3000);
             
                         socket.on('connect', () => {
                             socket.destroy();
                             console.log('Internet connection confirmed.');
                             resolve();
                         });
             
                         socket.on('error', () => {
                             socket.destroy();
                             console.log('No internet. Retrying in 5 seconds...');
                             setTimeout(check, 5000);
                         });
             
                         socket.on('timeout', () => {
                             socket.destroy();
                             console.log('No internet (timeout). Retrying...');
                             setTimeout(check, 5000);
                         });
             
                         socket.connect(7822, '85.187.128.52'); // Try connecting to the SSH server directly to confirm internet
                     };
             
                     check();
                 });
             }
             
             
             
             let reconnecting = false;
             
             function delay(ms) {
                 return new Promise(resolve => setTimeout(resolve,ms));
             }
             
             async function reconnectWithDelay() {
                 if (reconnecting) return;
             
                 reconnecting = true;
             
                 try {
                     console.log('Reconnecting in 10 seconds...');
                     await delay(10000);
             
                     console.log('Cleaning up existing connections...');
                     if (db){
                         db.destroy();
                         db = null;
                     }
             
                     if (localServer) {
                         localServer.closeAllConnections?.();
                         await new Promise(res => localServer.close(res));
                         localServer = null;
                     }
                     if (sshClient) {
                         sshClient.removeAllListeners();
                         sshClient.destroy();
                         sshClient = null;
                     }
                     console.log('Re-initializing connection...');
                     await waitForInternet();
                     await initialize();
                     reconnecting = false;
                 } catch (err) {
                     console.error('Reconnection failed:', err.message);
                     reconnecting = false;
                     await reconnectWithDelay();
                 }
                 reconnecting = false;
             }
             
             
             // Initialize connection and start SMS checking
             async function initialize() {
                 try {
                     await waitForInternet(); //

                     await connectWithSSHTunnel();

                     console.log('Starting SMS check loop...');
                     checkAndSendSMS();

                 } catch (err) {
                     console.error('Connection failed:', err.message);
                     await reconnectWithDelay();
                 }
             }

async function checkAndSendSMS() {
    if (mutex) return;
    mutex = true;

   try {
   
    const sql = `
        SELECT * FROM vw_sms 
        WHERE txt_status = 0 
        AND LENGTH(mobile_number) IN (10, 11) -- allow for missing 0 or correct format
        AND mobile_number NOT LIKE '%00000000%'
        ORDER BY captured_date, captured_time 
        LIMIT 1
    `;
    const rows = await queryDb(sql);

    if (rows.length > 0) {
        let row = rows[0];

      
        if (!row.mobile_number.startsWith('0')) {
            const updatedNumber = '0' + row.mobile_number;
            console.log(`Normalized ${row.mobile_number} -> ${updatedNumber}`);
            row.mobile_number = updatedNumber;
        }

        const customBlock = row.sms_text_template
            ? '\r\n\r\n' + row.sms_text_template + '\r\n\r\n'
            : '\r\n\r\n';

        let data = {
            sms_body:
                (row.school_name || 'School') +
                '\r\nAttendance Monitoring System' +
                customBlock +
                row.fullname +
                '\r\n' +
                row.attendance_type +
                '\r\n' +
                row.message,
            sms_mobile: row.mobile_number,
            hashcode: row.hashcode,
            ID: row.ID,
            fullname: row.fullname
        };

        console.log('Data received from Db:', data);

        console.log('Sending SMS to:', data.sms_mobile);
        await sendSMS(data.sms_body, row);
    } else {
        console.log('No data found. Waiting for data...');
    }
} catch (err) {
    console.error(err);
} finally {
    mutex = false;
    setTimeout(checkAndSendSMS, 5000);
} 
}


const ATTENDANCE_DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

async function logSmsToAms(row, message, status, failureReason) {
    await queryDb(
        `INSERT INTO tbl_ams_sms_log
            (record_id, student_name, phone_attempted, registered_number, attendance_type, attendance_day, captured_date, captured_time, school_name, sms_message, status, failure_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            row.ID,
            row.fullname,
            row.mobile_number,
            row.mobile_number,
            row.attendance_type,
            ATTENDANCE_DAYS[new Date(row.captured_date).getDay()],
            row.captured_date,
            row.captured_time,
            row.school_name,
            message,
            status,
            failureReason
        ]
    );
}

async function sendSMS(body, row) {
    const mobile = row.mobile_number;
    const id = row.ID;

    // node-pdu always encodes the destination address as TON=International
    // (PDU/SCA/Type.js defaults to 0x91 and nothing ever overrides it based on
    // the string content), but this app passes local-format numbers ('0' trunk
    // prefix, no country code). That mismatch produces a technically malformed
    // PDU address; most SMSCs silently tolerate/auto-correct it, but stricter
    // routes reject it outright. Converting to true international format here
    // (63 + subscriber number, no leading 0) makes the PDU address valid.
    const sendTo = mobile.startsWith('0') ? '63' + mobile.slice(1) : mobile;

    console.log(`Using modem1 for SMS to ${mobile}`);

    if (!modem1.isOpened) {
        console.log(`modem1 (${CP1}) is not connected. Skipping send to ${mobile}.`);
        await logSmsToAms(row, body, 'FAILED', 'Modem not connected');
        const deleteSql = `DELETE FROM tbl_records_online WHERE ID = ?`;
        const result = await queryDb(deleteSql, [id]);
        console.log('Number of records deleted: ' + result.affectedRows);
        return;
    }

    const sendSMSTask = new Promise((resolve, reject) => {
        // NOTE: serialport-gsm's sendSMS fires a fake "queued" success callback
        // synchronously if the callback has only 1 declared parameter, regardless
        // of modem/port state. Using a 2-parameter callback opts out of that branch
        // and only resolves once the message is actually sent (or genuinely failed).
        modem1.sendSMS(sendTo, body, false, (result, error) => {
            if (result && result.status === 'success') {
                resolve(result);
            } else {
                const reason = error
                    ? (error.message || String(error))
                    : (result && result.data && result.data.response)
                        || (result && result.error && String(result.error))
                        || (result && result.status ? `Send failed (status: ${result.status})` : 'Failed to send SMS');
                reject(new Error(reason));
            }
        });
    });

    const timeoutTask = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 60000)
    );

    try {
        const response = await Promise.race([sendSMSTask, timeoutTask]);

        if (response.status === 'success') {
            console.log(`SMS sent successfully to ${mobile}`);
            await logSmsToAms(row, body, 'SENT', null);
            const deleteSql = `DELETE FROM tbl_records_online WHERE ID = ?`;
            const result = await queryDb(deleteSql, [id]);
            console.log('Number of records deleted: ' + result.affectedRows);
        } else {
            console.log(`Failed to send SMS to ${mobile}.`);
            await logSmsToAms(row, body, 'FAILED', 'Send returned non-success status');
        }
    } catch (err) {
        console.log('Failed to send SMS:', err.message);
        await logSmsToAms(row, body, 'FAILED', err.message);
        const deleteSql = `DELETE FROM tbl_records_online WHERE ID = ?`;
        const result = await queryDb(deleteSql, [id]);
        console.log('Number of records deleted: ' + result.affectedRows);
    }
}
async function queryDb(sql, params = []) {
    // Wait for any in-progress reconnection to finish first
    while (reconnecting) {
        await delay(500);
    }

    // Check for null OR a connection that's internally marked fatal (before the error event fires)
    if (!db || (db._protocol && db._protocol._fatalError)) {
        if (db) db = null; // drop the dead connection reference
        console.warn('DB connection is null or fatal. Attempting to reconnect...');
        await reconnectWithDelay();
        while (reconnecting) {
            await delay(500);
        }
    }

    if (!db) {
        throw new Error('DB connection is not available after reconnect.');
    }

    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) return reject(err);
            resolve(results);
        });
    });
}
// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    if (db) {
        db.end();
    }
    if (localServer) {
        localServer.closeAllConnections?.();
        await new Promise(res => localServer.close(res));
    }
    if (sshClient) {
        sshClient.end();
    }
    process.exit(0);
});

// Start the application
initialize();
