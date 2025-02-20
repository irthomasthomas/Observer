from core.activities import registry, file

test_prompt = """This is a test prompt
NOTEPAD
NOTEPAD"""

with open("test.txt", "w") as f:
    f.write("Test content from file")

@file("NOTEPAD")
def _(filepath="test.txt"):
    return filepath


result = registry.inject_files(test_prompt)
print("Original:", test_prompt)
print("Injected:", result)
