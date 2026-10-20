"""Reproducible vector scenery. No runtime generation or dependencies."""
from pathlib import Path
from random import Random
OUT = Path(__file__).resolve().parents[1] / 'assets/bg/vector'
OUT.mkdir(parents=True, exist_ok=True)
rng = Random(24)
for name, sky, light, ground in [('forest','#102b32','#b9d5aa','#112d2d'),('cavern','#13172d','#69dce6','#171f36'),('arena','#352b36','#edba78','#332c32'),('walkway','#172d44','#c5dceb','#26354b'),('darkcastle','#171225','#a79bd1','#231d30'),('shop','#33231e','#f9c77e','#30251f')]:
    s = [f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
<defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="{sky}"/><stop offset="1" stop-color="{ground}"/></linearGradient><radialGradient id="light"><stop stop-color="{light}" stop-opacity=".35"/><stop offset="1" stop-color="{light}" stop-opacity="0"/></radialGradient><linearGradient id="floor" x2="0" y2="1"><stop stop-color="{ground}"/><stop offset="1" stop-color="#080d16"/></linearGradient><linearGradient id="stone" x2="1" y2="0"><stop stop-color="#182332"/><stop offset=".5" stop-color="#3f4953"/><stop offset="1" stop-color="#1b2531"/></linearGradient></defs>
<g id="atmosphere"><path fill="url(#sky)" d="M0 0H1600V1000H0Z"/><ellipse cx="820" cy="370" rx="720" ry="570" fill="url(#light)"/></g>''']
    if name in ('forest','walkway'):
        s += [f'<g id="distant-mountains" fill="{light}" opacity=".10"><path d="M0 620L180 350 310 470 540 230 740 520 970 310 1160 470 1400 240 1600 500V850H0Z"/></g>']
        s += ['<circle cx="1040" cy="205" r="68" fill="#dbe1cf" opacity=".65"/><circle cx="1063" cy="181" r="62" fill="'+sky+'"/>']
    if name == 'forest':
        for layer in range(3):
            s.append(f'<g id="trees-{layer}" fill="{["#224447","#163437","#0b2026"][layer]}">')
            for x in range(-100,1800,140 + layer*65):
                y = 640 + layer*40; w=30+layer*15; top=rng.randrange(-180,160)
                s.append(f'<path d="M{x-w} {y}Q{x+8} 400 {x-w} {top}L{x+w} {top}Q{x+20} 440 {x+w*2} {y}Z"/><path d="M{x} 320Q{x-120} 250 {x-170} 110Q{x-40} 240 {x} 220Q{x+100} 110 {x+170} 80Q{x+80} 260 {x} 320"/>')
            s.append('</g>')
    elif name == 'cavern':
        s.append('<g id="cave-vault" fill="#0b1222"><path d="M0 0H1600V650L1450 510 1390 160 1210 220 1100 90 850 170 700 90 480 220 320 180 190 470 0 640Z"/></g><g id="crystals" stroke="#8de6e1" stroke-opacity=".3">')
        for x,y,h in [(90,700,290),(220,680,170),(1420,700,300),(1300,670,140),(430,620,65),(1120,615,80)]:
            s.append(f'<path fill="#235567" d="M{x-40} {y}L{x-25} {y-h+40} {x} {y-h} {x+35} {y-h+50} {x+45} {y}Z"/><path fill="#70b6bf" opacity=".65" d="M{x} {y-h}L{x+35} {y-h+50} {x+45} {y} {x} {y-20}Z"/>')
        s.append('</g>')
    else:
        if name == 'walkway':
            s.append('<g id="bridge"><path fill="#101b2c" d="M0 630Q800 540 1600 630V1000H0Z"/><path fill="#68737b" d="M0 620Q800 540 1600 620V650Q800 570 0 650Z"/></g>')
        else:
            s.append('<g id="hall" stroke="#8b827b" stroke-opacity=".16" fill="#151b28">')
            for x in (180,490,800,1110,1420):
                s.append(f'<path d="M{x-105} 650V310Q{x-105} 200 {x} 140Q{x+105} 200 {x+105} 310V650Z"/><path fill="url(#light)" d="M{x-75} 600V320Q{x-75} 235 {x} 180Q{x+75} 235 {x+75} 320V600Z"/>')
            s.append('</g>')
        s.append('<g id="columns" fill="url(#stone)" stroke="#83909a" stroke-opacity=".12">')
        for x in (40,350,1190,1500):
            s.append(f'<path d="M{x} 0H{x+65}V690H{x-10}V650H{x}Z"/><path d="M{x-15} 110H{x+80}V140H{x-15}Z"/>')
        s.append('</g>')
        if name in ('arena','darkcastle'):
            for x in (420,1115):
                s.append(f'<path fill="{ "#793c38" if name=="arena" else "#493558"}" d="M{x} 130H{x+65}V420L{x+32} 460 {x} 420Z"/><path fill="#c1a776" opacity=".5" d="M{x+32} 230L{x+47} 260 {x+32} 290 {x+17} 260Z"/>')
        if name == 'shop':
            s.append('<g id="shelves" fill="#493b32" stroke="#917451" stroke-width="5">')
            for x in (120,1050):
                for y in (310,440,570):
                    s.append(f'<path d="M{x} {y}H{x+420}V{y+16}H{x}Z"/>')
                    for j in range(6):
                        xx=x+30+j*65
                        s.append(f'<path fill="{["#526c63","#8b644d","#685c77"][j%3]}" d="M{xx} {y}V{y-45}Q{xx} {y-60} {xx+12} {y-66}V{y-80}H{xx+28}V{y-66}Q{xx+40} {y-60} {xx+40} {y-45}V{y}Z"/>')
            s.append('</g>')
    s.append('<g id="foreground"><path fill="url(#floor)" d="M0 720Q400 650 800 690Q1200 660 1600 720V1000H0Z"/><path d="M0 750Q800 670 1600 750" fill="none" stroke="'+light+'" stroke-opacity=".13" stroke-width="2"/></g>')
    s.append('<g id="motes" fill="'+light+'">')
    for _ in range(45):
        x,y=rng.randrange(1600),rng.randrange(180,800)
        s.append(f'<circle cx="{x}" cy="{y}" r="{rng.choice([1,1,2])}" opacity="{rng.uniform(.15,.55):.2f}"/>')
    s.append('</g></svg>')
    (OUT/f'{name}.svg').write_text('\n'.join(s))
