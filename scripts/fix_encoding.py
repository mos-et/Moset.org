paths = [
    r's:\Naraka Studio\Moset\Biblia_Moset.md',
    r's:\Naraka Studio\Moset\Biblia_Moset_en.md'
]

replacements = {
    'Ã³': 'ó', 'Ã­': 'í', 'Ã±': 'ñ', 'Ã©': 'é', 'Ã¡': 'á', 'Ãº': 'ú', 'Ãš': 'Ú',
    'â€”': '—', 'â†’': '→', 'â—„': '◄', 'â–º': '►', 'â”Œ': '┌', 'â”€': '─',
    'â”‚': '│', 'â””': '└', 'â”˜': '┘', 'â”œ': '├', 'Â·': '·', 'Â¡': '¡', 'Â¿': '¿',
    'â€œ': '“', 'âˆž': '∞', 'Ã“': 'Ó', 'Ã\x81': 'Á', 'Ã‰': 'É', 'Ã‘': 'Ñ', 'Ãœ': 'Ü'
}

for path in paths:
    try:
        with open(path, 'r', encoding='utf-8') as f:
            text = f.read()
        
        # Try to reverse the mojibake automatically
        try:
            byte_str = text.encode('cp1252')
            fixed_text = byte_str.decode('utf-8')
            text = fixed_text
        except:
            # Fallback to manual replacement
            for k, v in replacements.items():
                text = text.replace(k, v)

        with open(path, 'w', encoding='utf-8') as f:
            f.write(text)
        print(f'Fixed: {path}')
    except Exception as e:
        print(f'Error fixing {path}: {e}')

print('All done')

