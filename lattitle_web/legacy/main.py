"""Browser entry point for the preserved Lattitle prototype."""

import asyncio
import traceback
import pygame

try:
    from lattitle_main import main
    asyncio.run(main())
except Exception:
    message = traceback.format_exc()
    print(message)
    try:
        import platform
        platform.window.infobox.innerText = message
    except Exception:
        pass
