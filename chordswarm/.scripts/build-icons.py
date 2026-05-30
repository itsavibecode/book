# Generates ChordSwarm social/icon assets into the chordswarm/ folder:
#   og.png (1200x630), favicon.png (32), favicon-16.png, apple-touch-icon.png (180)
# Run:  python .scripts/build-icons.py   (from chordswarm/)
from PIL import Image, ImageDraw, ImageFont
import os

OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOLD = [r"C:\Windows\Fonts\segoeuib.ttf", r"C:\Windows\Fonts\arialbd.ttf"]
REG  = [r"C:\Windows\Fonts\segoeui.ttf",  r"C:\Windows\Fonts\arial.ttf"]
PURPLE=(124,92,255); LPURPLE=(182,155,255); INK=(243,240,255); MUTED=(169,159,206)

def font(cands, size):
    for p in cands:
        try: return ImageFont.truetype(p, size)
        except Exception: pass
    return ImageFont.load_default()

def vgrad(w,h,top,bot):
    img=Image.new("RGB",(w,h)); px=img.load()
    for y in range(h):
        t=y/(h-1); c=tuple(int(top[i]+(bot[i]-top[i])*t) for i in range(3))
        for x in range(w): px[x,y]=c
    return img

def tsize(d,s,f):
    b=d.textbbox((0,0),s,font=f); return b[2]-b[0], b[3]-b[1], b

# ---- OG card 1200x630 ----
W,H=1200,630
og=vgrad(W,H,(36,27,70),(10,7,22)); d=ImageDraw.Draw(og)
ft=font(BOLD,124)
w1,h1,_=tsize(d,"Chord",ft); w2,_,_=tsize(d,"Swarm",ft)
x=(W-(w1+w2))//2; y=205
d.text((x,y),"Chord",font=ft,fill=INK); d.text((x+w1,y),"Swarm",font=ft,fill=LPURPLE)
ftag=font(REG,40); tag="Guitar Hero for your Kick chat"
wt,_,_=tsize(d,tag,ftag); d.text(((W-wt)//2,y+165),tag,font=ftag,fill=MUTED)
d.rounded_rectangle([(W//2-130,y+250),(W//2+130,y+258)],radius=4,fill=PURPLE)
og.save(os.path.join(OUT,"og.png")); print("og.png")

# ---- icon: purple rounded square + white play triangle ----
def icon(size):
    img=Image.new("RGBA",(size,size),(0,0,0,0)); d=ImageDraw.Draw(img)
    d.rounded_rectangle([(0,0),(size-1,size-1)],radius=int(size*0.24),fill=PURPLE+(255,))
    cx,cy=size*0.54,size*0.5; s=size*0.26
    d.polygon([(cx-s,cy-s),(cx-s,cy+s),(cx+s,cy)],fill=(255,255,255,255))
    return img
icon(32).save(os.path.join(OUT,"favicon.png"))
icon(16).save(os.path.join(OUT,"favicon-16.png"))
icon(180).save(os.path.join(OUT,"apple-touch-icon.png"))
print("icons written")
