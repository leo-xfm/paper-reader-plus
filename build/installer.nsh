!include LogicLib.nsh
!include nsDialogs.nsh

!define PRP_HWND_BROADCAST 0xffff
!define PRP_WM_FONTCHANGE 0x001D
!define PRP_MARKDOWN_FONT_REG_KEY "Software\Microsoft\Windows NT\CurrentVersion\Fonts"

!ifndef BUILD_UNINSTALLER
Var installMarkdownFonts
Var markdownFontsCheckbox
!endif

!macro customHeader
  LangString prpMarkdownFontsPageTitle ${LANG_ENGLISH} "Markdown fonts"
  LangString prpMarkdownFontsPageTitle ${LANG_SIMPCHINESE} "Markdown 字体"
  LangString prpMarkdownFontsPageSubtitle ${LANG_ENGLISH} "Choose whether to install the bundled Markdown font set."
  LangString prpMarkdownFontsPageSubtitle ${LANG_SIMPCHINESE} "选择是否安装随 Paper Reader Plus 附带的 Markdown 字体。"
  LangString prpMarkdownFontsCheckbox ${LANG_ENGLISH} "Install diverse Markdown fonts"
  LangString prpMarkdownFontsCheckbox ${LANG_SIMPCHINESE} "安装多样化 Markdown 字体"
  LangString prpMarkdownFontsDescription ${LANG_ENGLISH} "Installs the fonts from the app fonts folder for the current Windows user, including Aptos, Anonymous Pro, DejaVu Sans Mono, Monaco, Monaspace, Source Code Pro, and Space Mono."
  LangString prpMarkdownFontsDescription ${LANG_SIMPCHINESE} "为当前 Windows 用户安装应用 fonts 文件夹中的字体，包括 Aptos、Anonymous Pro、DejaVu Sans Mono、Monaco、Monaspace、Source Code Pro 和 Space Mono。"
!macroend

!ifndef BUILD_UNINSTALLER
!macro customInit
  StrCpy $installMarkdownFonts 0
!macroend

!macro customPageAfterChangeDir
  Page custom MarkdownFontsPageCreate MarkdownFontsPageLeave
!macroend

Function MarkdownFontsPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 12u "$(prpMarkdownFontsPageSubtitle)"
  Pop $0

  ${NSD_CreateCheckbox} 0 24u 100% 14u "$(prpMarkdownFontsCheckbox)"
  Pop $markdownFontsCheckbox
  ${If} $installMarkdownFonts == 1
    ${NSD_Check} $markdownFontsCheckbox
  ${EndIf}

  ${NSD_CreateLabel} 0 48u 100% 52u "$(prpMarkdownFontsDescription)"
  Pop $0

  nsDialogs::Show
FunctionEnd

Function MarkdownFontsPageLeave
  ${NSD_GetState} $markdownFontsCheckbox $installMarkdownFonts
FunctionEnd
!endif

!macro installMarkdownFont FONT_FILE FONT_REG_NAME
  ${If} ${FileExists} "$INSTDIR\resources\fonts\${FONT_FILE}"
    SetOutPath "$LOCALAPPDATA\Microsoft\Windows\Fonts"
    CopyFiles /SILENT "$INSTDIR\resources\fonts\${FONT_FILE}" "$LOCALAPPDATA\Microsoft\Windows\Fonts\${FONT_FILE}"
    ${If} ${FileExists} "$LOCALAPPDATA\Microsoft\Windows\Fonts\${FONT_FILE}"
      WriteRegStr HKCU "${PRP_MARKDOWN_FONT_REG_KEY}" "${FONT_REG_NAME}" "$LOCALAPPDATA\Microsoft\Windows\Fonts\${FONT_FILE}"
      System::Call 'gdi32::AddFontResourceExW(w "$LOCALAPPDATA\Microsoft\Windows\Fonts\${FONT_FILE}", i 0, i 0) i .r0'
    ${EndIf}
  ${EndIf}
!macroend

!ifndef BUILD_UNINSTALLER
!macro customInstall
  ${If} $installMarkdownFonts == 1
    CreateDirectory "$LOCALAPPDATA\Microsoft\Windows\Fonts"
    !insertmacro installMarkdownFont "AnonymousPro-Regular.ttf" "Anonymous Pro (TrueType)"
    !insertmacro installMarkdownFont "Aptos.ttf" "Aptos (TrueType)"
    !insertmacro installMarkdownFont "DejaVuSansMono.ttf" "DejaVu Sans Mono (TrueType)"
    !insertmacro installMarkdownFont "Monaco 400.ttf" "Monaco (TrueType)"
    !insertmacro installMarkdownFont "MonaspaceArgon-Regular.otf" "Monaspace Argon (OpenType)"
    !insertmacro installMarkdownFont "MonaspaceKrypton-Regular.otf" "Monaspace Krypton (OpenType)"
    !insertmacro installMarkdownFont "MonaspaceNeon-Regular.otf" "Monaspace Neon (OpenType)"
    !insertmacro installMarkdownFont "MonaspaceRadon-Regular.otf" "Monaspace Radon (OpenType)"
    !insertmacro installMarkdownFont "MonaspaceXenon-Regular.otf" "Monaspace Xenon (OpenType)"
    !insertmacro installMarkdownFont "SourceCodePro-Regular.ttf" "Source Code Pro (TrueType)"
    !insertmacro installMarkdownFont "SpaceMono-Regular.ttf" "Space Mono (TrueType)"
    SendMessage ${PRP_HWND_BROADCAST} ${PRP_WM_FONTCHANGE} 0 0 /TIMEOUT=5000
  ${EndIf}
!macroend
!endif
