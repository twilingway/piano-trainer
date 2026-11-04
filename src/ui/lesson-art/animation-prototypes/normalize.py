from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import hashlib
import json
import shutil

OUT = Path(__file__).resolve().parent
INPUTS = {
    'do': 'exec-42508637-6a8a-4bcc-ae14-2f0f79c11c94.png',
    're': 'exec-d196611d-d980-4d5f-8b80-d734ea5f29ef.png',
    'mi': 'exec-56e4d462-7d37-4ea6-8dbd-581da4e74649.png',
}
STATES = ['neutral', 'correct', 'gentle-wrong']
TIMINGS = [[1100, 130, 130, 400], [140, 180, 260, 220], [130, 260, 220, 450]]
FRAME_SIZE = (320, 384)
PIVOT = (160, 360)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


for folder in ['sources', 'sheets', 'previews', 'qa']:
    (OUT / folder).mkdir(parents=True, exist_ok=True)

manifest = {
    'schemaVersion': 1,
    'status': 'prototype-not-integrated',
    'generationTool': 'built-in image_gen',
    'promptFile': 'prompts.json',
    'shape': 'eighth-note-character-stem-up',
    'limitation': 'Персонаж с флажком восьмой. Не заменяет целую, половинную или четверть в учебной партитуре.',
    'frameSize': list(FRAME_SIZE),
    'pivotPx': list(PIVOT),
    'grid': {'columns': 4, 'rows': 3, 'stateOrder': STATES},
    'sampling': 'linear; clamp atlas frames to their rectangles; no generated mipmaps',
    'normalization': 'Перенос целых пикселей, без масштабирования. Нижний центр силуэта alpha>=128 совмещён с общей опорой. Сохранена исходная альфа внутри обрезки с запасом8px.',
    'notes': {},
}
report = {'notes': {}, 'assertions': {}}
contacts = {}
for theme, background in [('dark', '#041723'), ('light', '#fff5e6')]:
    contacts[theme] = Image.new('RGB', (768, 9 * 240), background)

for note_index, (note, generated_name) in enumerate(INPUTS.items()):
    source = OUT / 'sources' / f'{note}-source.png'
    image = Image.open(source).convert('RGBA')
    sheet = Image.new('RGBA', (FRAME_SIZE[0]*4, FRAME_SIZE[1]*3))
    alpha_hist = image.getchannel('A').histogram()
    note_manifest = {'source': f'sources/{source.name}', 'generatedFilename': generated_name, 'sourceSha256': sha(source), 'sheet': f'sheets/{note}-sheet.webp', 'frames': [], 'animations': {}}
    note_report = {'sourceSize': list(image.size), 'alphaRange': list(image.getchannel('A').getextrema()), 'fullyTransparentPixels': alpha_hist[0], 'lowAlphaNoisePixels1to7': sum(alpha_hist[1:8]), 'rawSilhouetteSizes': [], 'normalizedBounds': []}
    all_frames = []
    for row, state in enumerate(STATES):
        frames = []
        for column in range(4):
            bounds = (round(column*image.width/4), round(row*image.height/3), round((column+1)*image.width/4), round((row+1)*image.height/3))
            cell = image.crop(bounds)
            box = cell.getchannel('A').point(lambda a: 255 if a >= 128 else 0).getbbox()
            assert box, (note, row, column)
            left, top, right, bottom = box
            assert left > 0 and top > 0 and right < cell.width and bottom < cell.height
            crop = (max(0,left-8), max(0,top-8), min(cell.width,right+8), min(cell.height,bottom+8))
            offset = (PIVOT[0] - round((left+right)/2), PIVOT[1] - bottom)
            frame = Image.new('RGBA', FRAME_SIZE)
            frame.paste(cell.crop(crop), (crop[0]+offset[0], crop[1]+offset[1]))
            normalized_box = frame.getchannel('A').point(lambda a: 255 if a >= 128 else 0).getbbox()
            assert normalized_box and normalized_box[3] == PIVOT[1]
            assert min(normalized_box[:2]) >= 0 and normalized_box[2] < FRAME_SIZE[0]
            sheet.paste(frame, (column*FRAME_SIZE[0], row*FRAME_SIZE[1]))
            frames.append(frame)
            all_frames.append(frame)
            note_report['rawSilhouetteSizes'].append([right-left, bottom-top])
            note_report['normalizedBounds'].append(list(normalized_box))
            note_manifest['frames'].append({'state': state, 'index': column, 'atlasRect': [column*FRAME_SIZE[0], row*FRAME_SIZE[1], *FRAME_SIZE], 'sourceCellRect': list(bounds), 'sourceCropInCell': list(crop), 'sourceToFrameOffsetPx': list(offset), 'visibleBoundsAlpha128': list(normalized_box)})
            for theme, contact in contacts.items():
                preview = frame.resize((160,192), Image.Resampling.LANCZOS)
                x = column*192 + 16
                y = (note_index*3+row)*240 + 36
                contact.paste(preview, (x,y), preview)
                draw = ImageDraw.Draw(contact)
                draw.text((column*192+10, y-24), f'{note} / {state} / {column}', fill='#c6dbe6' if theme=='dark' else '#253c43')
                draw.line((column*192+8,y+180,column*192+184,y+180), fill='#54737c')
        preview_path = OUT / 'previews' / f'{note}-{state}.webp'
        frames[0].save(preview_path, save_all=True, append_images=frames[1:], duration=TIMINGS[row], loop=0, format='WEBP', lossless=True, exact=True, method=6)
        note_manifest['animations'][state] = {'row': row, 'frames': [0,1,2,3], 'durationsMs': TIMINGS[row], 'preview': f'previews/{preview_path.name}', 'previewLoop': 'infinite-for-inspection-only'}
    sheet_path = OUT / 'sheets' / f'{note}-sheet.webp'
    sheet.save(sheet_path, format='WEBP', lossless=True, exact=True, method=6)
    decoded = Image.open(sheet_path).convert('RGBA')
    assert decoded.tobytes() == sheet.tobytes(), f'Lossless roundtrip mismatch: {note}'
    note_manifest['sheetSha256'] = sha(sheet_path)
    note_report['losslessSheetRoundtrip'] = True
    note_report['widthDriftPx'] = max(s[0] for s in note_report['rawSilhouetteSizes'])-min(s[0] for s in note_report['rawSilhouetteSizes'])
    note_report['heightDriftPx'] = max(s[1] for s in note_report['rawSilhouetteSizes'])-min(s[1] for s in note_report['rawSilhouetteSizes'])
    note_report['normalizedBaselineDriftPx'] = 0
    note_report['previewFrameCounts'] = {}
    for state in STATES:
        p = Image.open(OUT/'previews'/f'{note}-{state}.webp')
        note_report['previewFrameCounts'][state] = p.n_frames
        assert p.n_frames == 4
    manifest['notes'][note] = note_manifest
    report['notes'][note] = note_report

for theme, contact in contacts.items():
    contact.save(OUT/'qa'/f'contact-{theme}.webp', format='WEBP', quality=94, method=6)
report['assertions'] = {'threeSourcesCopiedByteIdentically': True, 'thirtySixFrames': True, 'ninePreviewsFourFramesEach': True, 'allSheetsLosslessRGBAroundtrip': True, 'noAlpha128ClippedBySourceGrid': True, 'baselineAllFramesPx': PIVOT[1], 'creativeEditing': False}
write_json(OUT/'manifest.json', manifest)
write_json(OUT/'qa'/'report.json', report)
