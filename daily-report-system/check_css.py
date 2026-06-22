with open('D:/hyq/cjs/zb/daily-report-system/app.v3.js', 'rb') as f:
    data = f.read()

# Find the line containing #modalWeeklyMapping
idx = data.find(b'#modalWeeklyMapping')
# Go backwards to find the start of the string
line_start = data.rfind(b"' .modal-header", max(0, idx-200), idx)
if line_start < 0:
    line_start = data.rfind(b".modal-header", max(0, idx-200), idx)
    
# Find the end of this line
line_end = data.find(b"' +\r\n", line_start)
if line_end < 0:
    line_end = data.find(b"' +\n", line_start)

line = data[line_start:line_end+4]
print('Current line:')
print('Hex:', line.hex())
print('Repr:', repr(line))

# Check for } before \n
brace = line.find(b'}')
nl = line.find(b'\x5c\x6e')  # \n escape in source
print(f'\nClosing brace at: {brace}')
print(f'Newline escape at: {nl}')
if brace >= 0 and nl >= 0:
    between = line[brace+1:nl]
    print(f'Between }} and \\n: {repr(between)}')
