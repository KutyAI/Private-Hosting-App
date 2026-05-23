document.addEventListener('DOMContentLoaded', () => {
    // Navbar scroll effect
    const navbar = document.querySelector('.navbar');
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Scroll Reveal Animation
    const revealElements = document.querySelectorAll('.reveal');
    
    const reveal = () => {
        const windowHeight = window.innerHeight;
        const elementVisible = 100;
        
        revealElements.forEach(element => {
            const elementTop = element.getBoundingClientRect().top;
            
            if (elementTop < windowHeight - elementVisible) {
                element.classList.add('active');
            }
        });
    };
    
    // Trigger reveal on load
    reveal();
    
    // Trigger reveal on scroll
    window.addEventListener('scroll', reveal);
    
    // Simulated live console for the mockup
    const consoleBox = document.querySelector('.console-box');
    if (consoleBox) {
        const logLines = [
            '<p class="console-line text-info">[12:45:15 INFO]: Preparing spawn area: 24%</p>',
            '<p class="console-line text-info">[12:45:16 INFO]: Preparing spawn area: 87%</p>',
            '<p class="console-line text-success">[12:45:17 INFO]: Time elapsed: 1205 ms</p>',
            '<p class="console-line text-accent">[12:45:20 INFO]: Server tunnel proxy opened on 127.0.0.1:25565</p>',
            '<p class="console-line text-warning">[12:45:22 WARN]: HostAgent synchronized presence with database</p>',
            '<p class="console-line text-success">[12:45:25 INFO]: STUN gathered 4 relay candidates. P2P Ready.</p>'
        ];
        
        let logIndex = 0;
        setInterval(() => {
            if (logIndex < logLines.length) {
                consoleBox.insertAdjacentHTML('beforeend', logLines[logIndex]);
                consoleBox.scrollTop = consoleBox.scrollHeight;
                logIndex++;
            } else {
                // reset or loop if needed, but let's just keep it static after finish
            }
        }, 3000);
    }
});
