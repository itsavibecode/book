/* Keepsake - getting a file onto the device.
   iPhone and iPad: Safari ignores a cross-origin download attribute and a
   Content-Disposition download lands in Files, not Photos, so the bytes come
   through the proxy into a File and go to the share sheet, whose Save Image /
   Save Video puts them in Photos. Everywhere else: a plain link to the proxy
   with dl=1, which answers with Content-Disposition: attachment.
   Also the store-only zip for Save all: photos and MP4s are already
   compressed, so storing them is as small as deflating and needs no library. */
(function () {
  'use strict';

  var IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  /* Whether this browser can hand a file to the share sheet at all. Checked
     once with an empty JPEG-typed file. */
  var SHARE_FILES = (function () {
    try {
      return !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'x.jpg', { type: 'image/jpeg' })] }));
    } catch (e) { return false; }
  })();

  var USE_SHARE = IOS && SHARE_FILES;

  /* Fetch through the proxy with progress. Rejects with an Error whose
     .cause is 'expired', 'too-big', 'limited', 'network' or 'cancelled'. */
  function fetchBlob(url, opts) {
    opts = opts || {};
    return fetch(url, { signal: opts.signal }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (b) {
          var e = new Error('fetch failed');
          e.cause = res.status === 429 ? 'limited' : (b && b.cause) === 'too-big' ? 'too-big' : res.status === 410 ? 'expired' : 'network';
          throw e;
        });
      }
      var total = Number(res.headers.get('Content-Length')) || 0;
      var type = res.headers.get('Content-Type') || 'application/octet-stream';
      if (!res.body || !res.body.getReader) return res.blob();
      var reader = res.body.getReader();
      var chunks = [];
      var loaded = 0;
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) return new Blob(chunks, { type: type });
          chunks.push(r.value);
          loaded += r.value.byteLength;
          if (opts.onProgress) opts.onProgress(loaded, total);
          return pump();
        });
      }
      return pump();
    }, function (err) {
      var e = new Error('fetch failed');
      e.cause = opts.signal && opts.signal.aborted ? 'cancelled' : 'network';
      throw e;
    });
  }

  /* Resolves 'shared', 'dismissed' (the user closed the sheet) or
     'needs-tap' (Safari wants a fresh tap because the download took too
     long after the first one; the caller asks for a second tap). */
  function shareFile(file) {
    return navigator.share({ files: [file] }).then(function () { return 'shared'; }, function (err) {
      if (err && err.name === 'NotAllowedError') return 'needs-tap';
      return 'dismissed';
    });
  }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  /* ---------- store-only zip ---------- */

  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function dosTime(d) {
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
    };
  }

  /* entries: [{ name, blob }]. Resolves to a Blob (application/zip). */
  function zip(entries) {
    var enc = new TextEncoder();
    var parts = [];
    var central = [];
    var offset = 0;
    var when = dosTime(new Date());
    return entries.reduce(function (p, entry) {
      return p.then(function () { return entry.blob.arrayBuffer(); }).then(function (buf) {
        var data = new Uint8Array(buf);
        var name = enc.encode(entry.name);
        var crc = crc32(data);
        var local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true);
        local.setUint16(4, 20, true);
        local.setUint16(6, 0x0800, true); // UTF-8 names
        local.setUint16(8, 0, true); // stored
        local.setUint16(10, when.time, true);
        local.setUint16(12, when.date, true);
        local.setUint32(14, crc, true);
        local.setUint32(18, data.length, true);
        local.setUint32(22, data.length, true);
        local.setUint16(26, name.length, true);
        local.setUint16(28, 0, true);
        parts.push(local.buffer, name, entry.blob);

        var cd = new DataView(new ArrayBuffer(46));
        cd.setUint32(0, 0x02014b50, true);
        cd.setUint16(4, 20, true);
        cd.setUint16(6, 20, true);
        cd.setUint16(8, 0x0800, true);
        cd.setUint16(10, 0, true);
        cd.setUint16(12, when.time, true);
        cd.setUint16(14, when.date, true);
        cd.setUint32(16, crc, true);
        cd.setUint32(20, data.length, true);
        cd.setUint32(24, data.length, true);
        cd.setUint16(28, name.length, true);
        cd.setUint32(42, offset, true);
        central.push(cd.buffer, name);
        offset += 30 + name.length + data.length;
      });
    }, Promise.resolve()).then(function () {
      var cdSize = central.reduce(function (n, b) { return n + b.byteLength; }, 0);
      var end = new DataView(new ArrayBuffer(22));
      end.setUint32(0, 0x06054b50, true);
      end.setUint16(8, entries.length, true);
      end.setUint16(10, entries.length, true);
      end.setUint32(12, cdSize, true);
      end.setUint32(16, offset, true);
      return new Blob(parts.concat(central, [end.buffer]), { type: 'application/zip' });
    });
  }

  window.KeepsakeSave = {
    IOS: IOS,
    USE_SHARE: USE_SHARE,
    fetchBlob: fetchBlob,
    shareFile: shareFile,
    downloadBlob: downloadBlob,
    zip: zip
  };
})();
