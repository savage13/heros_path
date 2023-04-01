

function uint32(buf, little) {
    return new DataView(buf).getUint32(0, little);
}
function uint8(buf, little) {
    return new DataView(buf).getUint8(0, little);
}
function uint16(buf, little) {
    return new DataView(buf).getUint16(0, little);
}

export async function trackRead(file) {
    const ybits = 13;
    const xbits = 14;
    const ymask = 0x1fff; // 13 bits
    const xmask = 0x3fff; // 14 bits
    const bmask = 0x1f;   //  5 bits
    const buf = await file.arrayBuffer();
    const len = buf.byteLength;
    let hdr = new Uint8Array(buf.slice(0,64));
    let little = false;
    if(hdr[4] == 0x01 && hdr[5] == 0x2c) {
        little = false;
    } else if (hdr[5] == 0x01 && hdr[4] == 0x2c) {
        little = true;
    } else if (hdr[4] == 0x00 && hdr[5] != 0x00) {
        little = false;
    } else if (hdr[5] == 0x00 && hdr[4] != 0x00) {
        little = true;
    } else {
        console.log('unknown endian')
        return undefined;
    }
    const fid = uint8(buf.slice(0,1), little);     // File ID - follows with filename##.sav
    const tid = uint8(buf.slice(1,2), little);     // Track ID - Order of Tracks based on time played
    const numrec = uint8(buf.slice(2,3), little);  // Number of Records in File
    const maxpts = uint16(buf.slice(4,6), little); // Number of Points in last Record
    const i08 = uint32(buf.slice(8,12), little);   // ???

    const blksize = 1216;
    let offt0 = 64;
    let pts = [];
    let time = [];
    let npts = 0;
    for(let i = 0; i <= numrec; i++) {
        const offt = offt0 + blksize * i;
        if(offt > len || offt + blksize >= len) {
            break;
        }
        const t0 = uint32(buf.slice(offt, offt+4), little);
        const t1 = uint32(buf.slice(offt+4, offt+8), little);
        for(let j = 0; j < maxpts; j++ ) {
            const val = buf.slice(offt + 16 + j * 4,
                                  offt + 16 + (j+1) * 4);
            let z = uint32(val, little);
            let y = z & ymask;
            let x = (z >> ybits) & xmask;
            z = (z >> (xbits + ybits)) & bmask;

            if(x > 8192) {
                x = (8192 - x)
            }
            if(y > 4096) {
                y = (4096 - y)
            }
            if(x > 5000) {
                continue;
            }
            pts.push(
                {
                    x, y,
                    outside: (z & 0x10) == 0x10, // b00 (left to right)
                    _b01: (z & 0x08) == 0x08,    // Do not appear to modify position
                    _b02: (z & 0x04) == 0x04,    //
                    _b03: (z & 0x02) == 0x02,    //
                    _b04: (z & 0x01) == 0x01,    //
                    _hdr: z,
                }
            )
        }
        time.push( { time: t0, time_total: t1, n0: npts, n1: npts+pts.length }  );
        npts += pts.length;
    }
    return { pts, fid, track_id: tid, numrec, maxpts, time, i08, _hdr: hdr, }
}


export async function trackReadFiles(files) {
    let tracks = [];
    for(let i = 0; i < files.length; i++) {
        let file = files[i];
        let track = await trackRead(file);
        tracks.push(track);
    }
    // Sort by Track ID
    tracks.sort((a,b) => { return a.track_id - b.track_id; });
    return tracks;
}

