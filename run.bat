set GOOGLE_APPLICATION_CREDENTIALS=config/speech_auth.json
node dist/cli.js demo/notinsync.mkv --logLevel=debug -t 0.70 > output.txt