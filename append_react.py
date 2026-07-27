import os

filepath = 'C:/Users/corte/Desktop/New folder (2)/annex_modules_react.html'

with open(filepath, 'r') as f:
    content = f.read()

marker = 'const { useMemo, useState } = React;'
idx = content.find(marker)
if idx == -1:
    print('ERROR: marker not found')
else:
    new_content = content[:idx] + 'const { useMemo, useState } = React;\n\n' + open('C:/Users/corte/Desktop/New folder (2)/react_code.js', 'r').read() + '\n</script>\n</body>\n</html>'
    with open(filepath, 'w') as f:
        f.write(new_content)
    print('SUCCESS')
