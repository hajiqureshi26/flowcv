'use client';
import { useEditor, EditorContent } from '@tiptap/react';
import { useEffect } from 'react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import type { RichText } from '@/resume/types';

export default function RichEditor({value,onChange,ariaLabel='Summary'}:{value:RichText;onChange:(v:RichText)=>void;ariaLabel?:string}){
 const editor=useEditor({extensions:[StarterKit.configure({link:{openOnClick:false}, underline:false}),Underline],content:value,immediatelyRender:false,editorProps:{attributes:{'aria-label':ariaLabel}},onUpdate:({editor})=>onChange(editor.getJSON() as RichText)});
 useEffect(()=>{if(editor&&JSON.stringify(editor.getJSON())!==JSON.stringify(value))editor.commands.setContent(value,{emitUpdate:false});},[editor,value]);
 return <><div className="format-bar" role="toolbar" aria-label={`${ariaLabel} formatting`}><button type="button" aria-label="Bold" aria-pressed={editor?.isActive('bold')} onClick={()=>editor?.chain().focus().toggleBold().run()}><b>B</b></button><button type="button" aria-label="Italic" aria-pressed={editor?.isActive('italic')} onClick={()=>editor?.chain().focus().toggleItalic().run()}><i>I</i></button><button type="button" aria-label="Underline" aria-pressed={editor?.isActive('underline')} onClick={()=>editor?.chain().focus().toggleUnderline().run()}><u>U</u></button><button type="button" aria-label="Bullet list" aria-pressed={editor?.isActive('bulletList')} onClick={()=>editor?.chain().focus().toggleBulletList().run()}>Bullet list</button><button type="button" aria-label="Numbered list" aria-pressed={editor?.isActive('orderedList')} onClick={()=>editor?.chain().focus().toggleOrderedList().run()}>Numbered list</button><button type="button" aria-label="Add link" onClick={()=>{const url=window.prompt('Link URL');if(url)editor?.chain().focus().setLink({href:url}).run();}}>Link</button><button type="button" aria-label="Undo" onClick={()=>editor?.chain().focus().undo().run()}>Undo</button><button type="button" aria-label="Redo" onClick={()=>editor?.chain().focus().redo().run()}>Redo</button></div><div className="tiptap-field"><EditorContent editor={editor} aria-label={ariaLabel}/></div></>;
}
