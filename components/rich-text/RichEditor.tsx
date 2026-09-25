'use client';
import { useEditor, EditorContent } from '@tiptap/react';
import { useEffect } from 'react';
import StarterKit from '@tiptap/starter-kit';
import type { RichText } from '@/resume/types';

export default function RichEditor({value,onChange}:{value:RichText;onChange:(v:RichText)=>void}){
 const editor=useEditor({extensions:[StarterKit.configure({link:{openOnClick:false}})],content:value,immediatelyRender:false,onUpdate:({editor})=>onChange(editor.getJSON() as RichText)});
 useEffect(()=>{if(editor&&JSON.stringify(editor.getJSON())!==JSON.stringify(value))editor.commands.setContent(value,{emitUpdate:false});},[editor,value]);
 return <><div className="format-bar" role="toolbar" aria-label="Summary formatting"><button type="button" aria-label="Bold" aria-pressed={editor?.isActive('bold')} onClick={()=>editor?.chain().focus().toggleBold().run()}><b>B</b></button><button type="button" aria-label="Italic" aria-pressed={editor?.isActive('italic')} onClick={()=>editor?.chain().focus().toggleItalic().run()}><i>I</i></button><button type="button" aria-label="Underline" aria-pressed={editor?.isActive('underline')} onClick={()=>editor?.chain().focus().toggleUnderline().run()}><u>U</u></button><button type="button" aria-label="Bullet list" aria-pressed={editor?.isActive('bulletList')} onClick={()=>editor?.chain().focus().toggleBulletList().run()}>• List</button><button type="button" aria-label="Numbered list" aria-pressed={editor?.isActive('orderedList')} onClick={()=>editor?.chain().focus().toggleOrderedList().run()}>1. List</button><button type="button" aria-label="Add link" onClick={()=>{const url=window.prompt('Link URL');if(url)editor?.chain().focus().setLink({href:url}).run();}}>↗ Link</button><button type="button" aria-label="Undo" onClick={()=>editor?.chain().focus().undo().run()}>↶</button><button type="button" aria-label="Redo" onClick={()=>editor?.chain().focus().redo().run()}>↷</button></div><div className="tiptap-field"><EditorContent editor={editor}/></div></>;
}
