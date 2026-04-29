import os
import re

# Read the built HTML
html_path = '/mnt/agents/output/app/dist/index.html'
with open(html_path, 'r') as f:
    html = f.read()

# Inline CSS
css_match = re.search(r'<link[^>]*href="(./assets/[^"]+\.css)"[^>]*>', html)
if css_match:
    css_path = os.path.join('/mnt/agents/output/app/dist', css_match.group(1).lstrip('./'))
    if os.path.exists(css_path):
        with open(css_path, 'r') as f:
            css = f.read()
        html = html.replace(css_match.group(0), f'<style>{css}</style>')
        print(f'Inlined CSS: {css_match.group(1)} ({len(css)} bytes)')

# Inline JS  
js_match = re.search(r'<script[^>]*src="(./assets/[^"]+\.js)"[^>]*></script>', html)
if js_match:
    js_path = os.path.join('/mnt/agents/output/app/dist', js_match.group(1).lstrip('./'))
    if os.path.exists(js_path):
        with open(js_path, 'r') as f:
            js = f.read()
        html = html.replace(js_match.group(0), f'<script type="module">{js}</script>')
        print(f'Inlined JS: {js_match.group(1)} ({len(js)} bytes)')

# Write the single-file HTML
single_path = '/mnt/agents/output/app/dist/index.html'
with open(single_path, 'w') as f:
    f.write(html)

print(f'\nSingle-file HTML: {single_path} ({len(html)} bytes total)')
print('Ready for GitHub Pages drag-and-drop!')
