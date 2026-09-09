"""The python side of the end-to-end comparison: the inputs, and the answers.

Writes three things into fixtures/ that tools/test-endtoend.cjs and
tools/test-detect.cjs need and the repo does not carry:

  raw/<name>.rgba    the decoded image, so the JavaScript side never has to
                     decode a PNG to be compared - a difference in a PNG
                     decoder is not a difference in this port, and mixing the
                     two would mean never knowing which one you measured.
  raw/meta.json      each image's width and height.
  detect-fast.json   what pixelfixer.core.detect(mode="fast") answers.
  fresh/<name>.rgba  what pixelfixer.api.process answers, PIXELS included,
                     with ONE IMAGE PER PROCESS.

That last constraint is the whole reason this file is a loop over subprocess
calls rather than a loop over images. The reference's k-means runs on
OpenCV's process-global RNG, which quantize.py never seeds, so the pixels it
returns depend on how many random numbers were drawn before it. Two calls in
one process differ by 24% of their bytes - measured, not assumed, and the
numbers are in ../README.md. Comparing anything but a fresh process against a
fresh process measures that RNG rather than this port.

Usage:  python tools/parity-endtoend.py            (needs the venv described
        in ../README.md, with pixelfixer installed -e)
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FIX = os.path.join(ROOT, 'fixtures')

# The three synthetic fixtures ship with the repo; the four example images
# come from the reference checkout, and are skipped when it is not beside us.
EXAMPLES = os.path.join(ROOT, '..', '..', 'pixel-art-fixer', 'examples')


def sources():
    out = []
    for n in ('tiny', 'small', 'mid'):
        out.append((n, os.path.join(FIX, n + '.png')))
    for n in ('dragon', 'frog', 'koi-pond', 'lighthouse'):
        p = os.path.join(EXAMPLES, n + '.png')
        if os.path.exists(p):
            out.append((n, p))
    return out


def one(name, path):
    """Everything for ONE image, in a process of its own."""
    import numpy as np
    from PIL import Image
    from pixelfixer.core import detect
    from pixelfixer.api import process

    a = np.array(Image.open(path).convert('RGBA'))
    a.tofile(os.path.join(FIX, 'raw', name + '.rgba'))

    r = detect(a, mode='fast')
    det = {'cols': int(r['cols']), 'rows': int(r['rows']),
           'step_x': float(r['step_x']), 'step_y': float(r['step_y']),
           'consensus': str(r['consensus'])}

    # api.process from the file's bytes, exactly as the tab's caller would -
    # and the FIRST and only call this process makes, so its RNG draws match
    # a JavaScript run that also starts clean.
    with open(path, 'rb') as fh:
        res = process(fh.read(), mode='fast', return_png=False)
    res['array'].tofile(os.path.join(FIX, 'fresh', name + '.rgba'))

    print(json.dumps({'name': name, 'w': int(a.shape[1]), 'h': int(a.shape[0]),
                      'detect': det, 'confidence': res['confidence']}))


if __name__ == '__main__':
    if len(sys.argv) == 3:            # the per-image child
        one(sys.argv[1], sys.argv[2])
        raise SystemExit(0)

    os.makedirs(os.path.join(FIX, 'raw'), exist_ok=True)
    os.makedirs(os.path.join(FIX, 'fresh'), exist_ok=True)
    meta, det = {}, {}
    for name, path in sources():
        r = subprocess.run([sys.executable, __file__, name, path],
                           capture_output=True, text=True)
        if r.returncode:
            print(name + ': FAILED\n' + r.stderr.strip()[-600:])
            raise SystemExit(1)
        got = json.loads(r.stdout.strip().splitlines()[-1])
        meta[name] = {'w': got['w'], 'h': got['h']}
        det[name] = got['detect']
        print('%-11s %4dx%-4d  ->  %3dx%-3d  %-18s %s'
              % (name, got['w'], got['h'], got['detect']['cols'],
                 got['detect']['rows'], got['detect']['consensus'],
                 got['confidence']))

    with open(os.path.join(FIX, 'raw', 'meta.json'), 'w') as fh:
        json.dump(meta, fh)
    with open(os.path.join(FIX, 'detect-fast.json'), 'w') as fh:
        json.dump(det, fh, indent=1)
    print('\nwrote fixtures for %d image(s); now run:\n'
          '  node tools/test-detect.cjs\n  node tools/test-endtoend.cjs' % len(meta))
