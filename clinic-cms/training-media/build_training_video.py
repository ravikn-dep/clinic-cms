from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path
import subprocess
import textwrap
import math

ROOT = Path('/home/ubuntu/clinic-cms')
OUT = ROOT / 'training-media'
SLIDES = OUT / 'slides'
SEGMENTS = OUT / 'segments'
SLIDES.mkdir(parents=True, exist_ok=True)
SEGMENTS.mkdir(parents=True, exist_ok=True)

AUDIO = OUT / 'cms-training-narration-female.wav'
VIDEO = OUT / 'clinic-cms-role-based-training-video.mp4'

W, H = 1920, 1080
BG1 = (246, 252, 248)
BG2 = (236, 248, 246)
TEAL = (20, 122, 111)
TEAL_DARK = (15, 82, 78)
MINT = (196, 235, 222)
CORAL = (236, 132, 105)
GOLD = (232, 178, 93)
INK = (35, 53, 58)
MUTED = (95, 113, 116)
CARD = (255, 255, 252)
LINE = (213, 232, 226)

font_candidates = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    '/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf',
]
bold_candidates = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/opentype/noto/NotoSansCJKsc-Bold.otf',
]
font_path = next(Path(p) for p in font_candidates if Path(p).exists())
bold_path = next(Path(p) for p in bold_candidates if Path(p).exists())

def font(size, bold=False):
    return ImageFont.truetype(str(bold_path if bold else font_path), size)

def gradient_background():
    img = Image.new('RGB', (W, H), BG1)
    pix = img.load()
    for y in range(H):
        t = y / (H - 1)
        r = int(BG1[0] * (1 - t) + BG2[0] * t)
        g = int(BG1[1] * (1 - t) + BG2[1] * t)
        b = int(BG1[2] * (1 - t) + BG2[2] * t)
        for x in range(W):
            pix[x, y] = (r, g, b)
    return img

def rounded(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)

def wrap_text(text, max_chars):
    lines = []
    for para in text.split('\n'):
        if not para.strip():
            lines.append('')
            continue
        lines.extend(textwrap.wrap(para, width=max_chars))
    return lines

def draw_wrapped(draw, text, xy, fnt, fill, max_chars, line_gap=12):
    x, y = xy
    for line in wrap_text(text, max_chars):
        draw.text((x, y), line, font=fnt, fill=fill)
        y += fnt.size + line_gap
    return y

def draw_badge(draw, text, xy, fill, text_fill=(255,255,255)):
    x, y = xy
    f = font(28, True)
    bbox = draw.textbbox((0,0), text, font=f)
    pad_x, pad_y = 22, 12
    rounded(draw, (x, y, x + bbox[2] + pad_x*2, y + bbox[3] + pad_y*2), 28, fill)
    draw.text((x + pad_x, y + pad_y - 2), text, font=f, fill=text_fill)

def make_slide(idx, title, subtitle, bullets, module, accent=TEAL):
    img = gradient_background().convert('RGBA')
    deco = Image.new('RGBA', (W, H), (0,0,0,0))
    dd = ImageDraw.Draw(deco)
    dd.ellipse((1450, -220, 2140, 470), fill=(*MINT, 115))
    dd.ellipse((-180, 760, 340, 1280), fill=(*CORAL, 55))
    dd.ellipse((1290, 710, 1700, 1120), fill=(*GOLD, 65))
    deco = deco.filter(ImageFilter.GaussianBlur(3))
    img.alpha_composite(deco)
    draw = ImageDraw.Draw(img)

    # top status strip
    rounded(draw, (90, 68, 1830, 146), 38, (255,255,255,210), outline=LINE, width=2)
    draw_badge(draw, 'Clinic CMS Training', (120, 86), accent)
    draw.text((1440, 98), f'Section {idx:02d}', font=font(28, True), fill=TEAL_DARK)

    # main title card
    rounded(draw, (120, 205, 1145, 875), 46, (255,255,255,232), outline=LINE, width=2)
    draw.text((180, 275), title, font=font(68, True), fill=INK)
    y = draw_wrapped(draw, subtitle, (184, 380), font(36), MUTED, 42, 14)
    y += 30
    for n, b in enumerate(bullets, start=1):
        rounded(draw, (184, y, 230, y+46), 23, (*MINT, 255))
        draw.text((201, y+5), str(n), font=font(28, True), fill=TEAL_DARK)
        draw_wrapped(draw, b, (250, y+2), font(32), INK, 45, 10)
        y += 86

    # side visual panel
    rounded(draw, (1215, 205, 1800, 875), 46, (24, 132, 120, 235), outline=(127, 210, 195), width=2)
    draw.text((1275, 280), module, font=font(44, True), fill=(255,255,255))
    draw.line((1275, 350, 1695, 350), fill=(210,245,238), width=3)
    labels = ['Screen to open', 'Role responsible', 'Key data to edit', 'Safety check']
    yy = 405
    for i, label in enumerate(labels):
        rounded(draw, (1275, yy, 1710, yy+74), 24, (255,255,255,226), outline=(218,249,243), width=1)
        draw.ellipse((1305, yy+18, 1342, yy+55), fill=[GOLD, MINT, CORAL, (245,250,248)][i % 4])
        draw.text((1360, yy+19), label, font=font(28, True), fill=TEAL_DARK)
        yy += 95
    draw.text((1275, 792), 'Visual guide for clinic staff training', font=font(25), fill=(226,249,245))

    # footer
    draw.text((120, 950), 'Use sample data first. Publish only when the owner is ready.', font=font(29, True), fill=TEAL_DARK)
    draw.text((120, 992), 'Prepared by Manus AI for Clinic CMS rollout training.', font=font(23), fill=MUTED)
    img.convert('RGB').save(SLIDES / f'slide_{idx:02d}.png', quality=95)

slides = [
    ('Welcome to Clinic CMS', 'A friendly training guide for publishing, login, roles, and daily clinic workflows.', ['Start with owner review', 'Train each team by module', 'Use staged rollout for safer adoption'], 'Start Here'),
    ('Publish for Full-Scale Use', 'The owner controls when the CMS goes live from the Management UI.', ['Review the latest checkpoint', 'Test a full sample visit', 'Click Publish only when ready'], 'Publishing'),
    ('Login and Account Safety', 'Each staff member should sign in with their own account so activity stays accountable.', ['Open the published clinic URL', 'Use individual staff accounts', 'Do not share logins'], 'Login'),
    ('Roles: Admin and User', 'Admins handle oversight. Users handle day-to-day clinic work.', ['Admins can review audit logs and exports', 'Users perform normal workflow tasks', 'Give admin access sparingly'], 'Roles'),
    ('Reception Workflow', 'Reception uses Patient Registration and Patient Records to start and track the visit.', ['Register new patients', 'Print OPD tracking slips', 'Search existing patient records'], 'Reception'),
    ('Doctor Workflow', 'Clinical staff use Ambient Scribe and patient history to support consultation documentation.', ['Upload or capture consultation audio', 'Review transcript and structured note', 'Finalize only after clinical review'], 'Doctor'),
    ('Pharmacy and Prices', 'Pharmacy Inventory manages stock, expiry, reorder levels, and medicine unit prices.', ['Update quantity and expiry', 'Maintain reorder level alerts', 'Edit medicine unit price here'], 'Pharmacy'),
    ('Billing and Payments', 'Billing creates invoices, sets line prices, applies discounts, and updates payment status.', ['Add invoice line items', 'Edit invoice-specific prices', 'Mark Pending, Paid, or Partial'], 'Billing'),
    ('Notifications and Audit Logs', 'Notifications help staff act quickly, while Audit Logs support admin accountability.', ['Review and clear operational alerts', 'Admins monitor sensitive actions', 'Use audit review during rollout'], 'Oversight'),
    ('Where to Edit What', 'Use the right module for every operational change.', ['Patients: Registration and Records', 'Stock and prices: Pharmacy Inventory', 'Invoices and payments: Billing'], 'Edit Map'),
    ('Safe Rollout Plan', 'Begin with a controlled pilot before daily clinic-wide use.', ['Publish after owner review', 'Run a complete mock visit', 'Add trained staff gradually'], 'Rollout'),
    ('Ready for Staff Training', 'Your CMS is ready for review, role training, and a careful clinic launch.', ['Keep accounts separate', 'Keep prices and stock current', 'Review audit logs regularly'], 'Next Steps'),
]

for idx, data in enumerate(slides, start=1):
    make_slide(idx, *data)

# Match narration duration; distribute across slides with intentional emphasis.
durations = [28, 48, 39, 48, 45, 47, 52, 52, 38, 43, 45, 35]
assert sum(durations) == 520 or True
# Scale to actual audio duration reported by ffprobe.
probe = subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nk=1:nw=1', str(AUDIO)], text=True).strip()
audio_duration = float(probe)
base_sum = sum(durations)
scaled = [d * audio_duration / base_sum for d in durations]

concat_lines = []
for idx, duration in enumerate(scaled, start=1):
    image_path = SLIDES / f'slide_{idx:02d}.png'
    segment_path = SEGMENTS / f'segment_{idx:02d}.mp4'
    # Static slide with a subtle zoom-in motion for a more video-like feel.
    frames = max(1, int(round(duration * 30)))
    vf = (
        f"scale=1920:1080,zoompan=z='min(zoom+0.00028,1.045)':"
        f"d={frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30,"
        f"format=yuv420p"
    )
    subprocess.run([
        'ffmpeg', '-y', '-loop', '1', '-i', str(image_path), '-t', f'{duration:.3f}',
        '-vf', vf, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', str(segment_path)
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    concat_lines.append(f"file '{segment_path}'\n")

concat_file = OUT / 'segments.txt'
concat_file.write_text(''.join(concat_lines))
silent_video = OUT / 'clinic-cms-training-visuals.mp4'
subprocess.run(['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', str(concat_file), '-c', 'copy', str(silent_video)], check=True)
subprocess.run([
    'ffmpeg', '-y', '-i', str(silent_video), '-i', str(AUDIO), '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', str(VIDEO)
], check=True)
print(VIDEO)
