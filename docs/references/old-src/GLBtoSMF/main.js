// main.js
import React, { useRef, useState, useEffect } from 'react';
import { createRoot }                     from 'react-dom/client';
import { unpackGLB }                      from './unpacker.js';
import { exportSMF }                      from './exporter.js';
import { DebugLogger }                    from './DebugLogger.js';
import { importSMF } from './importer.js';
import { packGLB } from './packer.js';

function App() {
  const fileRef      = useRef(null);
  const [gltf, setGltf]           = useState(null);
  const [meshesData, setMeshes]   = useState([]);
  const [texturesData, setTextures] = useState([]);
  const [bonesData, setBones]     = useState([]);
  const [animsData, setAnims]     = useState([]);
  const [error, setError]         = useState('');
  const [smfUrl, setSmfUrl]       = useState('');
  const smfFileRef = useRef(null);
  const [smfData, setSmfData] = useState(null);
  const [glbUrl, setGlbUrl] = useState('');

  // Initialize the debug logger once
  useEffect(() => {
    DebugLogger.init(true);
    DebugLogger.show();
    return () => DebugLogger.hide();
  }, []);

  // Handle file upload & unpack
  async function onUpload() {
    const file = fileRef.current.files[0];
    if (!file) return;
    setError('');
    setSmfUrl('');
    try {
      const url  = URL.createObjectURL(file);
      const data = await unpackGLB(url);
      DebugLogger.log('GLB unpacked', data);

      setGltf(data.gltf);
      setMeshes(data.meshes);
      setTextures(data.textures);
      setBones(data.bones);
      setAnims(data.animations);
    } catch (e) {
      DebugLogger.error('Failed to unpack GLB:', e.message);
      setError(`Error loading GLB: ${e.message}`);
    }
  }

  // Convert to a single .smf blob
  async function onConvert() {
    if (!gltf) {
      setError('Upload a GLB first');
      return;
    }
    setError('');
    try {
      const url = exportSMF({
        meshes:     meshesData,
        textures:   texturesData.map(t => ({ image: t.image, previewUrl: t.previewUrl })),
        bones:      bonesData,
        animations: animsData
      });
      DebugLogger.log('SMF exported URL:', url);
      setSmfUrl(url);
    } catch (e) {
      DebugLogger.error('Failed to export SMF:', e.message);
      setError(`Error exporting SMF: ${e.message}`);
    }
  }

  // Download the .smf
  function onDownload() {
    if (!smfUrl) return;
    const a = document.createElement('a');
    a.href = smfUrl;
    a.download = 'model.smf';
    a.click();
  }

  async function onSmfUpload() {
    const file = smfFileRef.current.files[0];
    if (!file) return;
    setError('');
    setGlbUrl('');
    try {
      const arrayBuffer = await file.arrayBuffer();
      const data = importSMF(arrayBuffer);
      DebugLogger.log('SMF imported', data);
      setSmfData(data);
      // Optionally set meshes/textures/bones/anims from data for display
      setMeshes(data.meshes.map(m => ({ name: m.name, verts: m.verts, texIdx: m.texIdx })));
      setTextures(data.textures);
      setBones(data.bones);
      setAnims(data.animations.map(a => ({ name: a.name, frames: a.times.length })));
    } catch (e) {
      DebugLogger.error('Failed to import SMF:', e.message);
      setError(`Error loading SMF: ${e.message}`);
    }
  }

  // New handler: Convert to GLB
  async function onPackGLB() {
    if (!smfData) {
      setError('Upload a SMF first');
      return;
    }
    setError('');
    try {
      const { url } = await packGLB(smfData);
      setGlbUrl(url);
    } catch (e) {
      DebugLogger.error('Failed to pack GLB:', e.message);
      setError(`Error exporting GLB: ${e.message}`);
    }
  }

  // New handler: Download GLB
  function onDownloadGlb() {
    if (!glbUrl) return;
    const a = document.createElement('a');
    a.href = glbUrl;
    a.download = 'model.glb';
    a.click();
  }

  // Build the UI purely via createElement
  return React.createElement(
    'div',
    { className: 'p-4 space-y-4 overflow-auto' },

    // Error box
    error && React.createElement(
      'div',
      { className: 'p-3 bg-red-100 text-red-800 rounded' },
      error
    ),

    // File input
    React.createElement('input', {
      type: 'file',
      accept: '.glb,.gltf',
      ref: fileRef,
      onChange: onUpload,
      className: 'block w-full border rounded p-2'
    }),

    // Buttons
    React.createElement(
      'div',
      { className: 'space-x-2' },
      React.createElement(
        'button',
        {
          onClick: onConvert,
          className: 'px-4 py-2 bg-blue-600 text-white rounded'
        },
        'Export SMF'
      ),
      smfUrl && React.createElement(
        'button',
        {
          onClick: onDownload,
          className: 'px-4 py-2 bg-green-600 text-white rounded'
        },
        'Download .smf'
      )
    ),

    React.createElement('input', {
      type: 'file',
      accept: '.smf',
      ref: smfFileRef,
      onChange: onSmfUpload,
      className: 'block w-full border rounded p-2'
    }),

    // Buttons for SMF->GLB
    React.createElement(
      'div',
      { className: 'space-x-2' },
      React.createElement(
        'button',
        {
          onClick: onPackGLB,
          className: 'px-4 py-2 px-purple-600 bg-purple-600 text-white rounded'
        },
        'Export GLB from SMF'
      ),
      glbUrl && React.createElement(
        'button',
        {
          onClick: onDownloadGlb,
          className: 'px-4 py-2 bg-green-600 text-white rounded'
        },
        'Download .glb'
      )
    ),

    // Texture previews
    texturesData.length > 0 && React.createElement(
      'div',
      React.createElement('h3', { className: 'text-lg font-semibold' }, 'Textures'),
      React.createElement(
        'div',
        { className: 'grid grid-cols-3 gap-4' },
        texturesData.map((t,i) =>
          React.createElement('img', {
            key: i,
            src: t.previewUrl,
            alt: `texture${i}`,
            className: 'border max-w-[100px] max-h-[100px]'
          })
        )
      )
    ),

    // Mesh table
    meshesData.length > 0 && React.createElement(
      'div',
      null,
      React.createElement('h3', { className: 'text-lg font-semibold' }, 'Meshes'),
      React.createElement(
        'table',
        { className: 'border-collapse border border-gray-400 w-full' },
        React.createElement(
          'thead',
          null,
          React.createElement(
            'tr',
            null,
            ['#','Name','Verts','Tex#'].map(h =>
              React.createElement('th', { key: h, className: 'border border-gray-400 p-2' }, h)
            )
          )
        ),
        React.createElement(
          'tbody',
          null,
          meshesData.map((m,i) =>
            React.createElement(
              'tr',
              { key: i },
              React.createElement('td', { className: 'border border-gray-400 p-2' }, i),
              React.createElement('td', { className: 'border border-gray-400 p-2' }, m.name),
              React.createElement('td', { className: 'border border-gray-400 p-2' }, m.verts),
              React.createElement('td', { className: 'border border-gray-400 p-2' }, m.texIdx)
            )
          )
        )
      )
    ),

    // Bones table
    bonesData.length > 0 && React.createElement(
      'div',
      null,
      React.createElement('h3', { className: 'text-lg font-semibold' }, 'Bones'),
      React.createElement(
        'table',
        { className: 'border-collapse border border-gray-400 w-full' },
        React.createElement(
          'thead',
          null,
          React.createElement(
            'tr',
            null,
            ['#','Parent','IsBone'].map(h =>
              React.createElement('th', { key: h, className: 'border border-gray-400 p-2' }, h)
            )
          )
        ),
        React.createElement(
          'tbody',
          null,
          bonesData.map((b,i) =>
            React.createElement(
              'tr',
              { key: i },
              React.createElement('td', { className: 'border border-gray-400 p-2' }, b.index),
              React.createElement('td', { className: 'border border-gray-400 p-2' }, b.parent),
              React.createElement('td', { className: 'border border-gray-400 p-2' }, b.isBone ? '✔' : '')
            )
          )
        )
      )
    ),

    // Animations table
    animsData.length > 0 && React.createElement(
      'div',
      null,
      React.createElement('h3', { className: 'text-lg font-semibold' }, 'Animations'),
      React.createElement(
        'table',
        { className: 'border-collapse border border-gray-400 w-full' },
        React.createElement(
          'thead',
          null,
          React.createElement(
            'tr',
            null,
            ['Name','Frames'].map(h =>
              React.createElement('th', { key: h, className: 'border border-gray-400 p-2' }, h)
            )
          )
        ),
        React.createElement(
          'tbody',
          null,
          animsData.map((a,i) =>
            React.createElement(
              'tr',
              { key: i },
              React.createElement('td', { className: 'border border-gray-400 p-2' }, a.name),
              React.createElement('td', { className: 'border border-gray-400 p-2' }, a.frames)
            )
          )
        )
      )
    )
  );
}

// Mount the React app
const root = createRoot(document.getElementById('root'));
root.render(React.createElement(App));