import re

with open(r'c:\Users\corte\Documents\projects NOT DELETE\New folder (2)\annex_modules_redesigned.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace any remaining section-title elements that have children/elements or strong tags
def replace_dynamic_section(match):
    full = match.group(0)
    # Check if strong or emoji inside
    title_inner = match.group(2)
    # Strip span icon if any
    title_text = re.sub(r'<span[^>]*>[^<]*</span>', '', title_inner).strip()
    
    return f'''<div className="card-header mb-md">
              <div className="card-header-icon"><span className="material-symbols-outlined">event_note</span></div>
              <div className="card-header-text">
                <div className="card-header-title">{title_text}</div>
                <div className="card-header-subtitle">LOCATION & TIMELINE DETAILS</div>
              </div>
            </div>'''

content = re.sub(r'<div className="section-title(-sm)?">\s*(<span style=\{\{[^}]*\}\}>📅</span>[^<]*(?:<strong>[^<]+</strong>)?)\s*</div>', replace_dynamic_section, content)

with open(r'c:\Users\corte\Documents\projects NOT DELETE\New folder (2)\annex_modules_redesigned.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Remaining section-title items updated!")
