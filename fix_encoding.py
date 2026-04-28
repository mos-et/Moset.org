path = r's:\Naraka Studio\Moset\Biblia_Moset.md'

with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# We use bytes.decode("cp1252", errors="replace") 
# We'll use latin-1 but then we still might miss some chars.
# Better to use the known mapping but we can encode it cleanly here

replacements = {
    'Ã³': 'ó',
    'Ã­': 'í',
    'Ã±': 'ñ',
    'Ã©': 'é',
    'Ã¡': 'á',
    'Ãº': 'ú',
    'Ãš': 'Ú',
    'Ã\x8d': 'Í', # This is Ã followed by \x8d (which doesn't print)
    'â€”': '—',
    'â†’': '→',
    'â—„': '◄',
    'â–º': '►',
    'â”Œ': '┌',
    'â”€': '─',
    'â”\x90': '┐', # â followed by \x90
    'â”‚': '│',
    'â””': '└',
    'â”˜': '┘',
    'â”œ': '├',
    'â†\x90': '←',
    'Â·': '·',
    'â‰ˆ': '≈',
    'âˆš': '√',
    'Î±': 'α',
    'Î²': 'β',
    'Ã¼': 'ü',
    'Â¡': '¡',
    'Â¿': '¿',
    'â€œ': '“',
    'â€\x9d': '”',
    'âˆž': '∞',
    'Ã“': 'Ó',
    'Ã\x81': 'Á',
    'Ã‰': 'É',
    'Ã‘': 'Ñ',
    'Ãœ': 'Ü',
    'ðŸ”´': '🔴',
    'ðŸŸ¡': '🟡',
    'â ³': '⏳'
}

for k, v in replacements.items():
    text = text.replace(k, v)

# Also fix the specific `Ã ` where it's a space or nothing? 
# Wait, let's just use .encode('cp1252', errors='surrogateescape') maybe? No.
# Let's write our own byte decider.
# Actually we can do text.encode('windows-1252', errors='replace').decode('utf-8', errors='replace') 
# BUT characters like \x8d in windows-1252 cause EncodeError unless errors='replace'. But if we replace, we lose \x8d!
# The correct encoding that parses all bytes 0-255 is 'latin-1' or 'iso-8859-1'.
# BUT when read as cp1252, some bytes were lost or mapped differently? No, the text file on disk ALREADY has the broken utf-8 bytes.
# Example: ó in UTF-8 is \xc3\xb3. If read as cp1252, it was interpreted as Ã (\xc3) and ³ (\xb3). 
# Then saved as UTF-8, it became \xc3\x83 \xc2\xb3.
# So to reverse: read as UTF-8 -> get the string. Encode to 'cp1252' (or 'latin-1'). 
# If we use 'latin-1', we get the original bytes back exactly!
# Let's try it for the entire file:
try:
    # Try to reverse the mojibake
    byte_str = text.encode('cp1252')
    fixed_text = byte_str.decode('utf-8')
    text = fixed_text
except Exception as e:
    # If it fails, fallback to manual replacement
    print("Failed to auto-decode, using manual replacements.")

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print('Done')
