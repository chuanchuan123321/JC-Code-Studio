import { ProjectFile } from './types';

// Helper function to generate unique IDs
const generateId = () => Math.random().toString(36).substr(2, 9);

export const INITIAL_FILES: ProjectFile[] = [
  {
    id: generateId(),
    name: 'index.html',
    path: 'index.html',
    language: 'html',
    content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to JC-code Studio</title>
    <style>
        :root {
            --bg-color: #050505;
            --primary-color: #00f3ff;
            --secondary-color: #bc13fe;
            --text-color: #e0e0e0;
            --grid-color: rgba(0, 243, 255, 0.1);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            background-color: var(--bg-color);
            color: var(--text-color);
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            overflow: hidden;
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            perspective: 1000px;
        }

        /* Background Grid Animation */
        .grid-background {
            position: absolute;
            width: 200%;
            height: 200%;
            background-image:
                linear-gradient(var(--grid-color) 1px, transparent 1px),
                linear-gradient(90deg, var(--grid-color) 1px, transparent 1px);
            background-size: 50px 50px;
            transform: rotateX(60deg) translateY(-100px) translateZ(-200px);
            animation: grid-move 20s linear infinite;
            z-index: -2;
            opacity: 0.3;
        }

        @keyframes grid-move {
            0% { transform: rotateX(60deg) translateY(0) translateZ(-200px); }
            100% { transform: rotateX(60deg) translateY(50px) translateZ(-200px); }
        }

        /* Vignette and Overlay */
        .overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(circle, transparent 0%, #000000 90%);
            z-index: -1;
            pointer-events: none;
        }

        /* Main Container */
        .container {
            text-align: center;
            position: relative;
            z-index: 10;
            padding: 40px;
            border: 1px solid rgba(0, 243, 255, 0.3);
            background: rgba(5, 5, 5, 0.8);
            backdrop-filter: blur(5px);
            box-shadow: 0 0 20px rgba(0, 243, 255, 0.2), inset 0 0 20px rgba(0, 243, 255, 0.1);
            transform-style: preserve-3d;
            animation: float 6s ease-in-out infinite;
        }

        @keyframes float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-10px); }
        }

        /* Glitch Text Effect */
        .glitch-wrapper {
            position: relative;
            margin-bottom: 20px;
        }

        h1 {
            font-size: 4rem;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 5px;
            position: relative;
            color: var(--primary-color);
            text-shadow: 2px 2px var(--secondary-color);
        }

        h1::before, h1::after {
            content: attr(data-text);
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
        }

        h1::before {
            left: 2px;
            text-shadow: -1px 0 #ff00c1;
            clip: rect(44px, 450px, 56px, 0);
            animation: glitch-anim-1 5s infinite linear alternate-reverse;
        }

        h1::after {
            left: -2px;
            text-shadow: -1px 0 #00fff9;
            clip: rect(44px, 450px, 56px, 0);
            animation: glitch-anim-2 5s infinite linear alternate-reverse;
        }

        @keyframes glitch-anim-1 {
            0% { clip: rect(30px, 9999px, 10px, 0); }
            5% { clip: rect(80px, 9999px, 90px, 0); }
            10% { clip: rect(10px, 9999px, 40px, 0); }
            15% { clip: rect(50px, 9999px, 20px, 0); }
            20% { clip: rect(20px, 9999px, 60px, 0); }
            100% { clip: rect(70px, 9999px, 30px, 0); }
        }

        @keyframes glitch-anim-2 {
            0% { clip: rect(10px, 9999px, 80px, 0); }
            5% { clip: rect(40px, 9999px, 10px, 0); }
            10% { clip: rect(90px, 9999px, 50px, 0); }
            15% { clip: rect(20px, 9999px, 70px, 0); }
            20% { clip: rect(60px, 9999px, 20px, 0); }
            100% { clip: rect(30px, 9999px, 90px, 0); }
        }

        /* Subtitle */
        .subtitle {
            font-size: 1.2rem;
            color: var(--text-color);
            letter-spacing: 2px;
            margin-bottom: 40px;
            opacity: 0;
            animation: fade-in 2s ease-out forwards 1s;
        }

        @keyframes fade-in {
            to { opacity: 1; }
        }

        /* Button */
        .btn {
            display: inline-block;
            padding: 15px 40px;
            font-size: 1rem;
            text-transform: uppercase;
            letter-spacing: 2px;
            color: var(--primary-color);
            background: transparent;
            border: 1px solid var(--primary-color);
            text-decoration: none;
            position: relative;
            overflow: hidden;
            transition: 0.3s;
            cursor: pointer;
        }

        .btn:hover {
            background: var(--primary-color);
            color: var(--bg-color);
            box-shadow: 0 0 50px var(--primary-color);
        }

        .btn::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
            transition: 0.5s;
        }

        .btn:hover::before {
            left: 100%;
        }

        /* Decorative Corners */
        .corner {
            position: absolute;
            width: 20px;
            height: 20px;
            border: 2px solid var(--primary-color);
            transition: 0.3s;
        }

        .top-left { top: -2px; left: -2px; border-right: none; border-bottom: none; }
        .top-right { top: -2px; right: -2px; border-left: none; border-bottom: none; }
        .bottom-left { bottom: -2px; left: -2px; border-right: none; border-top: none; }
        .bottom-right { bottom: -2px; right: -2px; border-left: none; border-top: none; }

        .container:hover .corner {
            width: 30px;
            height: 30px;
            box-shadow: 0 0 10px var(--primary-color);
        }

        /* Scanline effect */
        .scanline {
            width: 100%;
            height: 100px;
            z-index: 10;
            background: linear-gradient(0deg, rgba(0,0,0,0) 0%, rgba(255, 255, 255, 0.03) 50%, rgba(0,0,0,0) 100%);
            opacity: 0.1;
            position: absolute;
            bottom: 100%;
            animation: scanline 10s linear infinite;
            pointer-events: none;
        }

        @keyframes scanline {
            0% { bottom: 100%; }
            100% { bottom: -100%; }
        }

        /* Particles Canvas */
        #particles {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: -1;
        }
    </style>
</head>
<body>

    <!-- Background Elements -->
    <div class="grid-background"></div>
    <div class="overlay"></div>
    <div class="scanline"></div>
    <canvas id="particles"></canvas>

    <!-- Main Content Card -->
    <div class="container">
        <!-- Decorative Corners -->
        <div class="corner top-left"></div>
        <div class="corner top-right"></div>
        <div class="corner bottom-left"></div>
        <div class="corner bottom-right"></div>

        <!-- Header -->
        <div class="glitch-wrapper">
            <h1 data-text="JC-code Studio">JC-code Studio</h1>
        </div>

        <!-- Subtitle with Typing Effect -->
        <div class="subtitle">
            <span id="subtitle-text"></span>
        </div>

        <!-- Call to Action -->
        <a href="#" class="btn">Initialize System</a>
    </div>

    <script>
        /**
         * Typewriter Logic
         */
        class TypeWriter {
            constructor(elementId, text, speed = 50) {
                this.element = document.getElementById(elementId);
                this.text = text;
                this.speed = speed;
                this.index = 0;
                this.element.innerHTML = '';
                this.cursor = '<span style="color: #00f3ff; animation: blink 1s infinite;">|</span>';
            }

            start() {
                // Add blink animation style dynamically if not present
                if (!document.getElementById('cursor-style')) {
                    const style = document.createElement('style');
                    style.id = 'cursor-style';
                    style.innerHTML = '@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }';
                    document.head.appendChild(style);
                }

                this.type();
            }

            type() {
                if (this.index < this.text.length) {
                    // Remove cursor, add char, add cursor back
                    const currentText = this.text.substring(0, this.index + 1);
                    this.element.innerHTML = currentText + this.cursor;
                    this.index++;
                    setTimeout(() => this.type(), this.speed);
                } else {
                    // Finished typing, keep cursor
                    this.element.innerHTML = this.text + this.cursor;
                }
            }
        }

        // Main initialization
        window.addEventListener('DOMContentLoaded', () => {
            // Define ParticleSystem inline to ensure it's available
            const ParticleSystem = class ParticleSystem {
                constructor(canvasId) {
                    this.canvas = document.getElementById(canvasId);
                    if (!this.canvas) {
                        console.warn('Canvas element with id \'' + canvasId + '\' not found');
                        return;
                    }
                    this.ctx = this.canvas.getContext('2d');
                    this.particles = [];
                    this.resize();

                    // Handle resize
                    window.addEventListener('resize', () => this.resize());

                    // Start loop
                    this.initParticles();
                    this.animate();
                }

                resize() {
                    if (!this.canvas) return;
                    this.canvas.width = window.innerWidth;
                    this.canvas.height = window.innerHeight;
                }

                initParticles() {
                    const particleCount = 100;
                    for (let i = 0; i < particleCount; i++) {
                        this.particles.push({
                            x: Math.random() * this.canvas.width,
                            y: Math.random() * this.canvas.height,
                            speed: 0.5 + Math.random() * 2,
                            size: Math.random() * 2,
                            opacity: Math.random() * 0.5 + 0.1
                        });
                    }
                }

                animate() {
                    if (!this.canvas || !this.ctx) return;

                    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

                    this.ctx.fillStyle = '#00f3ff';

                    this.particles.forEach(p => {
                        // Update
                        p.y += p.speed;
                        if (p.y > this.canvas.height) {
                            p.y = 0;
                            p.x = Math.random() * this.canvas.width;
                        }

                        // Draw
                        this.ctx.globalAlpha = p.opacity;
                        this.ctx.beginPath();
                        this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                        this.ctx.fill();
                    });

                    requestAnimationFrame(() => this.animate());
                }
            };

            // 1. Initialize Background Particles
            console.log('DOMContentLoaded fired, creating ParticleSystem');
            new ParticleSystem('particles');

            // 2. Initialize Typing Effect
            // Wait a bit for the container to float in/stabilize visually
            setTimeout(() => {
                const typer = new TypeWriter(
                    'subtitle-text',
                    'INNOVATION // DESIGN // FUTURE_TECH',
                    70
                );
                typer.start();
            }, 1500);

            // 3. Interactive Tilt Effect for Container
            const container = document.querySelector('.container');
            document.addEventListener('mousemove', (e) => {
                const xAxis = (window.innerWidth / 2 - e.pageX) / 25;
                const yAxis = (window.innerHeight / 2 - e.pageY) / 25;
                container.style.transform = \`rotateY(\${xAxis}deg) rotateX(\${yAxis}deg)\`;
            });

            // Reset tilt when mouse leaves
            document.addEventListener('mouseleave', () => {
                container.style.transform = \`rotateY(0deg) rotateX(0deg)\`;
            });
        });
    </script>
</body>
</html>`,
    type: 'file',
    createdAt: Date.now(),
    modifiedAt: Date.now()
  }
];