const mysql = require('mysql');
const serialportgsm = require('serialport-gsm');
const { Client } = require('ssh2');
const net = require('net');

const CP1 = 'COM3';
const CP2 = 'COM4'; // Add your second COM port here
const CP3 = 'COM5'
let modem1 = serialportgsm.Modem();
let modem2 = serialportgsm.Modem();
let modem3 = serialportgsm.Modem();

 // Flag to alternate between CP1 and CP2
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

 function setupModem(modem, portName) {
    modem.open(portName, options, {}, (err) => {
        if (err) {
            console.error(`Failed to open ${portName}:`, err.message);
        } else {
            console.log(`${portName} opened successfully!`);
        }
    });

    modem.on('open', () => console.log(`${portName} is ready`));
    modem.on('close', () => console.log(`${portName} closed`));
    modem.on('error', (err) => console.error(`${portName} error:`, err.message));
    modem.on('onSendingMessage', (msg) => console.log(`${portName} sending:`, msg));
    modem.on('onNewMessageIndicator', (msg) => console.log(`${portName} new message:`, msg));
}

// Initialize all modems with logging
setupModem(modem1, CP1);
setupModem(modem2, CP2);
setupModem(modem3, CP3);

// Open both modems

// SSH Configuration from .conf file
const sshConfig = {
    host: 'sg1-ss100.a2hosting.com',
    port: 22,
    username: 'schoolg1',
    password: '9p]4+5BdGQeE8v'
};

// Database configurations
const dbConfig = {
    host: 'localhost', // Connect to localhost through SSH tunnel
    port: 3309,        // Local port for SSH tunnel
    user: 'schoolg1_sgc',
    password: 'wh@kLb~M4lY;x~=x',
    database: 'schoolg1_db_cms_srlms',
    connectTimeout: 30000,
};

let db;
let mutex = false;
let sshClient;
let localServer;
let localPort = 3309; // Local port for the tunnel

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
      
                  socket.connect(443, '1.1.1.1'); // Cloudflare - checks general internet reachability, independent of the SSH host/port (which can be blocked/down while the internet itself is fine)
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

const modems = [modem1, modem2, modem3];
const ports = [CP1, CP2, CP3];
let currentModemIndex = 0;

// Strips accents/diacritics (Ñ, é, á, ü, ...) down to plain ASCII so the modem
// encodes the SMS as GSM-7 (160 chars/segment) instead of falling back to
// UCS2 (70 chars/segment), which was causing the modem to reject long
// messages with a bare "ERROR" after AT+CMGS.
function toGsmSafeText(str) {
    if (!str) return str;
    return str.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

async function checkAndSendSMS() {
    if (mutex) return;
    mutex = true;

    try {
        const sql = `
            SELECT * FROM vw_sms
            WHERE txt_status = 0
            AND LENGTH(mobile_number) IN (10, 11)
            AND mobile_number NOT LIKE '%00000000%'
            ORDER BY captured_date, captured_time
            LIMIT 3
        `;
        const rows = await queryDb(sql);

        if (rows.length === 0) {
            console.log('No data found. Waiting for data...');
        } else {
            // Normalize phone numbers and build send tasks
            const tasks = [];
            for (const row of rows) {
                if (!row.mobile_number.startsWith('0')) {
                    const updated = '0' + row.mobile_number;
                    console.log(`Updated ${row.mobile_number} → ${updated}`);
                    row.mobile_number = updated;
                }
                const customBlock = row.sms_text_template
                    ? '\r\n\r\n' + row.sms_text_template + '\r\n\r\n'
                    : '\r\n\r\n';

                const body = toGsmSafeText(
                    row.school_name +
                    '\r\nAttendance Monitoring System' +
                    customBlock +
                    row.fullname +
                    '\r\n' +
                    row.attendance_type +
                    '\r\n' +
                    row.message
                );

                tasks.push({ row, body });
            }

            // Send all tasks in parallel, each assigned its own modem slot
            await Promise.all(tasks.map((task) => {
                const modemIndex = currentModemIndex % modems.length;
                currentModemIndex++;
                return sendSMS(task.body, task.row, modemIndex);
            }));
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

async function sendSMS(body, row, modemIndex) {
    const mobile = row.mobile_number;
    const id = row.ID;
    const modem = modems[modemIndex];
    const port = ports[modemIndex];

    console.log(`Using ${port} for SMS to ${mobile}`);

    if (!modem.isOpened) {
        console.log(`${port} is not connected. Skipping send to ${mobile}.`);
        await logSmsToAms(row, body, 'FAILED', 'Modem not connected');
        const result = await queryDb(`DELETE FROM tbl_records_online WHERE ID = ?`, [id]);
        console.log('Number of records deleted: ' + result.affectedRows);
        return;
    }

    const sendSMSTask = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout')), 60000);
        // NOTE: serialport-gsm's sendSMS fires a fake "queued" success callback
        // synchronously if the callback has only 1 declared parameter, regardless
        // of modem/port state. Using a 2-parameter callback opts out of that branch
        // and only resolves once the message is actually sent (or genuinely failed).
        modem.sendSMS(mobile, body, false, (result, error) => {
            clearTimeout(timeout);
            if (result && result.status === 'success') resolve(result);
            else reject(new Error(error ? error.message || String(error) : (result ? result.error : 'Unknown error')));
        });
    });

    try {
        await sendSMSTask;
        console.log(`SMS sent successfully via ${port} to ${mobile}`);
        await logSmsToAms(row, body, 'SENT', null);
    } catch (err) {
        console.error(`Failed to send SMS via ${port} to ${mobile}: ${err.message}`);
        await logSmsToAms(row, body, 'FAILED', err.message);
    } finally {
        const result = await queryDb(`DELETE FROM tbl_records_online WHERE ID = ?`, [id]);
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
