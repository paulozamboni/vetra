import re

def email_key(value):
    return value.strip().casefold()

def phone_key(value):
    digits = re.sub(r'\D', '', value)
    if digits.startswith('55') and len(digits) in (12, 13):
        digits = digits[2:]
    return digits
