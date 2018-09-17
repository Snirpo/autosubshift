import * as VAD from "node-vad";
import {Srt, SrtLine} from "./srt/srt";
import {FFMPEGStream} from "./streams/ffmpeg-stream";
import {RecognizerStream} from "./streams/recognizer-stream";
import {MatcherStream} from "./streams/matcher-stream";
import {StreamUtils} from "./util/stream-utils";
import * as fs from "fs";
import * as path from "path";

const audioFrequency = 16000.0;
const bitsPerSample = 16; // multiple of 8

const speechConfig = {
    encoding: 'LINEAR16',
    sampleRateHertz: audioFrequency,
    languageCode: 'en-US',
    model: "video",
    enableWordTimeOffsets: true
};

export interface AutoSubSyncOptions {
    seekTime?: number,
    duration?: number,

    matchTreshold?: number,
    minWordMatchCount?: number,
    maxWordShift?: number,
}

export class AutoSubSync {

    static synchronize(videoFile: string,
                       srtFile: string,
                       {
                           seekTime = 600,
                           duration = 15,
                           matchTreshold = 0.80,
                           minWordMatchCount = 4,
                           maxWordShift = 4
                       }: AutoSubSyncOptions = {}) {
        return Srt.readLinesFromStream(fs.createReadStream(srtFile))
            .then(lines => {
                return StreamUtils.toPromise(
                    FFMPEGStream.create(videoFile, {
                        bitsPerSample: bitsPerSample,
                        audioFrequency: audioFrequency,
                        seekTime: seekTime,
                        duration: duration
                    }),
                    VAD.createStream({
                        audioFrequency: audioFrequency,
                        debounceTime: 1000,
                        mode: VAD.Mode.NORMAL
                    }),
                    RecognizerStream.create(speechConfig),
                    MatcherStream.create(lines, {
                        seekTime: seekTime * 1000,
                        matchTreshold: matchTreshold,
                        maxWordShift: maxWordShift,
                        minWordMatchCount: minWordMatchCount
                    })
                ).then((matches: any[]) => {
                    const avgDiff = matches.reduce((total, curr) => {
                        return total + (curr.line.startTime - curr.hyp.startTime);
                    }, 0) / matches.length;
                    console.debug(matches);
                    console.debug(`Number of matches: ${matches.length}\nAdjusting subs by ${avgDiff} ms`);
                    return lines.map(l => {
                        return {
                            ...l,
                            startTime: l.startTime + avgDiff,
                            endTime: l.endTime + avgDiff
                        }
                    });
                }).then((lines: SrtLine[]) => {
                    const outFile = `${path.dirname(srtFile)}/${path.basename(srtFile, ".srt")}_synced.srt`;
                    return Srt.writeLinesToStream(lines, fs.createWriteStream(outFile));
                })
            });
    }
}