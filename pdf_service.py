import io
import os
from fastapi import FastAPI, UploadFile, File, Form, Response
from fastapi.middleware.cors import CORSMiddleware
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from urllib.parse import quote

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 폰트 등록
FONT_PATH = "gulim.ttc" 
if not os.path.exists(FONT_PATH): FONT_PATH = "gulim.ttf"

if os.path.exists(FONT_PATH):
    try: pdfmetrics.registerFont(TTFont("Gulim", FONT_PATH))
    except: pass

def create_watermark_layer(text, font_size, opacity, rotation, position, page_width, page_height, tile_mode, spacing_x, spacing_y):
    packet = io.BytesIO()
    can = canvas.Canvas(packet, pagesize=(page_width, page_height))
    
    font_name = "Gulim" if os.path.exists(FONT_PATH) else "Helvetica"
    can.setFont(font_name, font_size)
    can.setFillAlpha(opacity)
    can.setFillColorRGB(0.5, 0.5, 0.5)
    
    if tile_mode:
        for x in range(0, int(page_width) + spacing_x, spacing_x):
            for y in range(0, int(page_height) + spacing_y, spacing_y):
                can.saveState()
                can.translate(x, y)
                can.rotate(rotation)
                can.drawCentredString(0, 0, text)
                can.restoreState()
    else:
        x, y = page_width / 2, page_height / 2
        padding = 50
        if position == "top-left": x, y = padding + 50, page_height - padding
        elif position == "top-center": x, y = page_width / 2, page_height - padding
        elif position == "top-right": x, y = page_width - padding - 50, page_height - padding
        elif position == "center-left": x, y = padding + 50, page_height / 2
        elif position == "center-right": x, y = page_width - padding - 50, page_height / 2
        elif position == "bottom-left": x, y = padding + 50, padding
        elif position == "bottom-center": x, y = page_width / 2, padding
        elif position == "bottom-right": x, y = page_width - padding - 50, padding
        
        can.saveState()
        can.translate(x, y)
        can.rotate(rotation)
        can.drawCentredString(0, 0, text)
        can.restoreState()
    
    can.save()
    packet.seek(0)
    return packet

@app.post("/watermark")
async def watermark_pdf(
    file: UploadFile = File(...),
    text: str = Form(...),
    font_size: int = Form(...),
    opacity: float = Form(...),
    rotation: int = Form(...),
    position: str = Form(...),
    tile_mode: bool = Form(False),
    spacing_x: int = Form(300),
    spacing_y: int = Form(400)
):
    try:
        input_pdf_bytes = await file.read()
        reader = PdfReader(io.BytesIO(input_pdf_bytes), strict=False)
        writer = PdfWriter()

        for page in reader.pages:
            width = float(page.mediabox.width)
            height = float(page.mediabox.height)
            
            watermark_packet = create_watermark_layer(
                text, font_size, opacity, rotation, position, width, height, tile_mode, spacing_x, spacing_y
            )
            watermark_page = PdfReader(watermark_packet).pages[0]
            
            # [원복] 다시 텍스트 위(상단 레이어)에 워터마크를 덮어씌웁니다.
            page.merge_page(watermark_page)
            writer.add_page(page)

        output_stream = io.BytesIO()
        writer.write(output_stream)
        output_stream.seek(0)
        
        # 파일명 자동 생성 로직 유지
        name_tag = text.split(' ')[0] if text else "보안"
        base_name, extension = os.path.splitext(file.filename)
        new_filename = f"{base_name} ({name_tag}){extension}"
        
        safe_filename = quote(new_filename)
        
        return Response(
            content=output_stream.getvalue(),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{safe_filename}",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        print(f"Error: {e}")
        return Response(content=f"Error: {str(e)}", status_code=500)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
